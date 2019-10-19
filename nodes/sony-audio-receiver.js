/*
 * Copyright (c) 2019 Jens-Uwe Rossbach
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

module.exports = function(RED)
{
    const MSG_GET_NOTIFICATIONS = 1;
    const MSG_SET_NOTIFICATIONS = 2;

    const STATUS_UNCONFIGURED = {fill: "yellow", shape: "dot", text: "unconfigured"    };
    const STATUS_NOTCONNECTED = {fill: "grey",   shape: "dot", text: "not connected"   };
    const STATUS_CONNECTING   = {fill: "grey",   shape: "dot", text: "connecting"      };
    const STATUS_CONNECTED    = {fill: "blue",   shape: "dot", text: "connected"       };
    const STATUS_READY        = {fill: "green",  shape: "dot", text: "ready"           };
    const STATUS_ERROR        = {fill: "red",    shape: "dot", text: "connection error"};

    const WebSocketClient = require("websocket").client;
    const APIFilter = require("../libs/sony-api-filter");


    function SonyAudioReceiverNode(config)
    {
        var node = this;
        RED.nodes.createNode(node, config);

        node.config = config;
        node.name = config.name;

        node.notifications = {notifyPowerStatus:               config.notifyPowerStatus,
                              notifyStorageStatus:             config.notifyStorageStatus,
                              notifySettingsUpdate:            config.notifySettingsUpdate,
                              notifySWUpdateInfo:              config.notifySWUpdateInfo,
                              notifyVolumeInformation:         config.notifyVolumeInformation,
                              notifyExternalTerminalStatus:    config.notifyExternalTerminalStatus,
                              notifyAvailablePlaybackFunction: config.notifyAvailablePlaybackFunction,
                              notifyPlayingContentInfo:        config.notifyPlayingContentInfo};

        node.client = null;
        node.connection = null;

        function createOuputArray(filterMsgs, eventMsg)
        {
            var arr = [];

            if (node.config.outFilters)
            {
                for (let i=0; i<filterMsgs.length; ++i)
                {
                    arr.push(filterMsgs[i]);
                }
            }

            if (node.config.outEvent)
            {
                arr.push(eventMsg);
            }

            return arr;
        }

        function sendEvent(eventMsg)
        {
            var filteredMsgs = [];

            if (node.config.outFilters && (eventMsg.payload !== null))
            {
                for (let i=0; i<node.config.outputPorts.length; ++i)
                {
                    if ("filter" in node.config.outputPorts[i])
                    {
                        let filter = {name: ""};

                        if (node.config.outputPorts[i].filter.name == "auto")
                        {
                            switch (eventMsg.method)
                            {
                                case "notifyPowerStatus":
                                {
                                    filter = {name: "powered", explicit: false};
                                    break;
                                }
                                case "notifySWUpdateInfo":
                                {
                                    filter = {name: "swupdate", explicit: false};
                                    break;
                                }
                                case "notifyPlayingContentInfo":
                                {
                                    filter = {name: "source"};
                                    break;
                                }
                                case "notifyVolumeInformation":
                                {
                                    filter = {name: "absoluteVolume"};
                                    break;
                                }
                            }
                        }
                        else
                        {
                            filter = node.config.outputPorts[i].filter;
                        }

                        filteredMsgs.push(APIFilter.filterData(eventMsg, filter));
                    }
                }
            }

            if (node.config.outFilters || node.config.outEvent)
            {
                node.send(createOuputArray(filteredMsgs, eventMsg));
            }
        }

        function switchNotifications(id, disable, enable)
        {
            var params = {};

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
                    params: [params]}
        }

        node.device = RED.nodes.getNode(config.device);
        if (node.device &&
            (node.config.outputs > 0))
        {
            node.client = new WebSocketClient();

            node.client.on("connect", function(connection)
            {
                node.status(STATUS_CONNECTED);

                node.debug("Client connected");
                node.connection = connection;

                connection.on("message", function(message)
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

                                notif.forEach(item =>
                                {
                                    if ((item.name in node.notifications) && (node.notifications[item.name]))
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

                                node.debug(subscribeRequest);
                                connection.sendUTF(subscribeRequest);
                            }
                            else if (msg.id == MSG_SET_NOTIFICATIONS)
                            {
                                node.status(STATUS_READY);
                                node.debug("Result: " + JSON.stringify(msg.result[0]));
                            }
                        }
                        else if (("method" in msg) && ("params" in msg))
                        {
                            if (msg.method in node.notifications)
                            {
                                node.debug("Event for " + msg.method + " received");

                                let eventMsg = {service: node.config.service,
                                                method: msg.method,
                                                version: msg.version,
                                                payload: (msg.params.length == 0) ? null : msg.params[0]};

                                sendEvent(eventMsg);
                            }
                            else
                            {
                                node.error("Unsupported event: " + msg.method);
                            }
                        }
                    }
                });

                connection.on("error", function(error)
                {
                    node.status(STATUS_ERROR);
                    node.error("Connection error: " + error.toString());
                });

                connection.on("close", function()
                {
                    node.status(STATUS_NOTCONNECTED);
                    node.debug("Connection closed");
                });

                connection.sendUTF(JSON.stringify(switchNotifications(MSG_GET_NOTIFICATIONS, [], [])));
            });

            node.client.on("connectFailed", function(error)
            {
                node.status(STATUS_ERROR);
                node.error("Failed to connect to Sony device: " + error.toString());
            });

            node.on("close", function()
            {
                if (node.connection)
                {
                    node.connection.close();
                }
            });

            let url = "ws://" + node.device.host + ":" + node.device.port + "/sony/" + node.config.service;

            node.status(STATUS_CONNECTING);
            node.debug("Connecting to: " + url);
            node.client.connect(url);
        }
        else
        {
            node.status(STATUS_UNCONFIGURED);
        }
    }

    RED.nodes.registerType("sony-audio-receiver", SonyAudioReceiverNode);
}