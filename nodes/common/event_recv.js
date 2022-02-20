/*
 * Copyright (c) 2022 Jens-Uwe Rossbach
 *
 * This code is licensed under the MIT License.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

const MSG_GET_NOTIFICATIONS = 1;
const MSG_SET_NOTIFICATIONS = 2;

const PING_DELAY              = 30000;
const PONG_DELAY              = 5000;
const DEFAULT_RETRY_DELAY     = 5000;
const DEFAULT_MAX_NUM_RETRIES = 5;

const STATUS_NOTCONNECTED = {fill: "grey",  shape: "dot", text: "notify.status.notConnected"   };
const STATUS_CONNECTED    = {fill: "blue",  shape: "dot", text: "notify.status.connected"      };
const STATUS_READY        = {fill: "green", shape: "dot", text: "notify.status.ready"          };
const STATUS_ERROR        = {fill: "red",   shape: "dot", text: "notify.status.connectionError"};

const Events = require("./event_constants.js");

const MAP_NOTIFICATIONS = {notifyPowerStatus:               Events.EVENT_SYSTEM_NOTIFY_POWER_STATUS,
                           notifyStorageStatus:             Events.EVENT_SYSTEM_NOTIFY_STORAGE_STATUS,
                           notifySettingsUpdate:            Events.EVENT_SYSTEM_NOTIFY_SETTINGS_UPDATE,
                           notifySWUpdateInfo:              Events.EVENT_SYSTEM_NOTIFY_SWUPDATE_INFO,
                           notifyVolumeInformation:         Events.EVENT_AUDIO_NOTIFY_VOLUME_INFO,
                           notifyExternalTerminalStatus:    Events.EVENT_AVCONTENT_NOTIFY_EXT_TERM_STATUS,
                           notifyAvailablePlaybackFunction: Events.EVENT_AVCONTENT_NOTIFY_AVAIL_PB_FUNCTION,
                           notifyPlayingContentInfo:        Events.EVENT_AVCONTENT_NOTIFY_PLAYING_CONTENT_INFO};

const WebSocketClient = require("websocket").client;
const EventEmitter = require("events").EventEmitter;

class EventReceiver extends EventEmitter
{
    constructor(service, node)
    {
        super();

        this.client = new WebSocketClient();
        this.connection = null;
        this.node = node;

        this.service = service;
        this.url = "ws://" + this.node.host + ":" + this.node.port + "/sony/" + this.service;

        this.eventMask = 0;
        this.eventCallback = null;

        this.pingTimer = null;
        this.pongTimer = null;

        this.recoveryTimer = null;
        this.reconnectOnClose = false;
        this.recoverOnClose = false;
        this.extendedRetries = false;
        this.retryDelay = DEFAULT_RETRY_DELAY;
        this.retryCount = DEFAULT_MAX_NUM_RETRIES;

        const recover = () =>
        {
            this.recoverOnClose = false;

            if ((this.retryCount != 0) || (this.node.extendedRecovery && !this.extendedRetries))
            {
                if (this.retryCount == 0)
                {
                    this.node.debug("Switching to extended recovery with " + ((this.node.numRetries == 0) ? "infinite retries" : ("a maximum of " + this.node.numRetries + " retries")) + " every " + this.node.retryDelay + " seconds");

                    this.extendedRetries = true;
                    this.retryDelay = this.node.retryDelay * 1000;
                    this.retryCount = (this.node.numRetries == 0) ? -1 : this.node.numRetries;
                }

                this.node.debug("Trying to recover in " + (this.retryDelay / 1000) + " seconds");
                this.recoveryTimer = setTimeout(() =>
                {
                    this.recoveryTimer = null;

                    if (this.retryCount > 0)
                    {
                        this.retryCount--;
                    }

                    this.client.connect(this.url);
                }, this.retryDelay);
            }
            else
            {
                this.node.error("Maximum number of retries reached, giving up");
                this.emit("status", STATUS_ERROR);
            }
        };

        this.client.on("connect", connection =>
        {
            this.connection = connection;
            this.extendedRetries = false;
            this.retryDelay = DEFAULT_RETRY_DELAY;
            this.retryCount = DEFAULT_MAX_NUM_RETRIES;

            this.node.debug("Connected to service '" + this.service + "'");
            this.emit("status", STATUS_CONNECTED);

            connection.on("message", message =>
            {
                if (message.type === "utf8")
                {
                    let msg = JSON.parse(message.utf8Data);

                    if ("id" in msg)
                    {
                        if (msg.id == MSG_GET_NOTIFICATIONS)
                        {
                            let notif = msg.result[0].disabled.concat(msg.result[0].enabled);
                            let enable = [];
                            let disable = [];

                            this.node.debug("Creating method list for service '" + this.service + "' with event mask b:" + this.eventMask.toString(2).padStart(4, "0"));
                            notif.forEach(item =>
                            {
                                if ((item.name in MAP_NOTIFICATIONS) && ((MAP_NOTIFICATIONS[item.name] & this.eventMask) != 0))
                                {
                                    enable.push(item);
                                }
                                else
                                {
                                    disable.push(item);
                                }
                            });

                            let subscribeRequest = JSON.stringify(switchNotifications(MSG_SET_NOTIFICATIONS,
                                                            (disable.length == 0) ? null : disable,
                                                            (enable.length == 0) ? null : enable));

                            this.node.trace(subscribeRequest);
                            connection.sendUTF(subscribeRequest);
                        }
                        else if (msg.id == MSG_SET_NOTIFICATIONS)
                        {
                            this.node.trace("Result: " + JSON.stringify(msg.result[0]));
                            this.emit("status", STATUS_READY);
                        }
                    }
                    else if (("method" in msg) && ("params" in msg))
                    {
                        if (msg.method in MAP_NOTIFICATIONS)
                        {
                            this.node.debug("Event for '" + msg.method + "' received");

                            let eventMsg = {host: this.node.host,
                                            service: this.service,
                                            method: msg.method,
                                            version: msg.version,
                                            payload: (msg.params.length == 0) ? null : msg.params[0]};

                            this.eventCallback(MAP_NOTIFICATIONS[msg.method], eventMsg);
                        }
                        else
                        {
                            this.node.warn("Unsupported event: " + msg.method);
                        }
                    }
                    else
                    {
                        this.node.warn("Unexpected message received");
                    }
                }
                else
                {
                    this.node.warn("Unknown message type: " + message.type);
                }
            });

            connection.on("pong", () =>
            {
                if (this.pongTimer)
                {
                    clearTimeout(this.pongTimer);
                    this.pongTimer = null;
                }
            });

            connection.on("error", error =>
            {
                this.node.error("Connection error: " + error.toString());
                this.emit("status", STATUS_ERROR);

                this.recoverOnClose = true;
            });

            connection.on("close", (reasonCode, description) =>
            {
                this.connection = null;

                if (this.pingTimer)
                {
                    clearInterval(this.pingTimer);
                    this.pingTimer = null;
                }

                if (this.pongTimer)
                {
                    clearTimeout(this.pongTimer);
                    this.pongTimer = null;
                }

                if (this.recoveryTimer)
                {
                    clearTimeout(this.recoveryTimer);
                    this.recoveryTimer = null;
                }

                this.node.debug("Connection closed: " + reasonCode + " (" + description + ")");
                this.emit("status", STATUS_NOTCONNECTED);

                if (this.reconnectOnClose)
                {
                    this.reconnectOnClose = false;

                    this.node.debug("Reconnecting to: " + this.url);
                    this.client.connect(this.url);
                }

                if (this.recoverOnClose)
                {
                    recover();
                }
            });

            this.pingTimer = setInterval(() =>
            {
                if (this.connection)
                {
                    this.node.debug("Sending ping to service: " + this.url);
                    this.connection.ping();

                    if (this.pongTimer)
                    {
                        clearTimeout(this.pongTimer);
                    }

                    this.pongTimer = setTimeout(() =>
                    {
                        this.pongTimer = null;

                        this.node.error("Connection error: No response to ping");
                        this.emit("status", STATUS_ERROR);

                        this.recoverOnClose = true;
                        this.connection.drop();
                    }, PONG_DELAY);
                }
            }, PING_DELAY);

            connection.sendUTF(JSON.stringify(switchNotifications(MSG_GET_NOTIFICATIONS, [], [])));
        });

        this.client.on("connectFailed", error =>
        {
            if (!this.extendedRetries)
            {
                this.node.error("Connection failed: " + error.toString());
                this.node.debug("URL: " + this.url);
            }

            recover();
        });
    }

    connect(mask, callback)
    {
        if (!this.connection)
        {
            this.eventMask = mask;
            this.eventCallback = callback;
            this.retryCount = DEFAULT_MAX_NUM_RETRIES;

            this.node.debug("Connecting to: " + this.url);
            this.client.connect(this.url);
        }
    }

    disconnect()
    {
        if (this.connection)
        {
            this.node.debug("Disconnecting");
            this.connection.close();
        }
    }

    reconnect()
    {
        this.retryCount = DEFAULT_MAX_NUM_RETRIES;

        if (this.connection)
        {
            this.reconnectOnClose = true;
            this.connection.close();
        }
        else
        {
            this.node.debug("Reconnecting to: " + this.url);
            this.client.connect(this.url);
        }
    }

    updateEventMask(mask)
    {
        this.node.debug("Updating event mask");

        this.eventMask = mask;
        if (this.connection)
        {
            this.connection.sendUTF(JSON.stringify(switchNotifications(MSG_GET_NOTIFICATIONS, [], [])));
        }
    }
}

function switchNotifications(id, disable, enable)
{
    let params = {};

    if (disable != null)
    {
        params.disabled = disable;
    }

    if (enable != null)
    {
        params.enabled = enable;
    }

    return {id: id,
            method: "switchNotifications",
            version: "1.0",
            params: [params]};
}

module.exports = EventReceiver;
