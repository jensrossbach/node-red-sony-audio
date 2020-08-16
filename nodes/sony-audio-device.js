/*
 * Copyright (c) 2020 Jens-Uwe Rossbach
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
    const DISCOVERY_SEARCH_TARGET = "urn:schemas-sony-com:service:ScalarWebAPI:1";
    const URI_REGEX               = /^http:\/\/([a-zA-Z0-9.-]+):([0-9]+)\/sony$/;

    const httpRequest = require("request-promise");
    const xmlConverter = require("xml-js");

    const EventReceiver = require("../libs/sony-event-recv.js");
    const SSDPClient = require("node-ssdp").Client;
    const ssdpClient = new SSDPClient({explicitSocketBind: true});

    var deviceList = [];


    RED.httpAdmin.get("/sony_audio_devices", RED.auth.needsPermission("sony-audio.read"), function(req, res)
    {
        if (req.query.type === "cached")
        {
            // return cached values
            RED.log.debug("Returning cached Sony audio devices");
            res.json(deviceList);
        }
        else
        {
            RED.log.debug("Searching for Sony audio devices");

            deviceList = [];
            ssdpClient.search(DISCOVERY_SEARCH_TARGET);

            setTimeout(() =>
            {
                ssdpClient.stop();
                res.json(deviceList);
            }, 5000);
        }
    });

    ssdpClient.on("response", function(headers, code)
    {
        if (code == 200)
        {
            httpRequest({method: "get", uri: headers.LOCATION}).then(response =>
            {
                let desc = xmlConverter.xml2js(response, {compact: true});
                let devName = desc.root.device.friendlyName._text;
                let modelName = desc.root.device.modelName._text;

                if (Object.prototype.hasOwnProperty.call(desc.root.device, "av:X_ScalarWebAPI_DeviceInfo"))
                {
                    let devURL = desc.root.device["av:X_ScalarWebAPI_DeviceInfo"]["av:X_ScalarWebAPI_BaseURL"]._text;

                    let matches = devURL.match(URI_REGEX);
                    if (matches != null)
                    {
                        RED.log.debug("Found Sony audio device: " + modelName + "/" + devName + "@" + matches[1] + ":" + matches[2]);
                        deviceList.push({name: devName, model: modelName, address: {host: matches[1], port: matches[2]}});
                    }
                }
                else
                {
                    RED.log.debug("Ignoring device with malformed descriptor");
                }
            }).catch(error =>
            {
                RED.log.error("Error getting device description: " + error);
            });
        }
        else
        {
            RED.log.error("Error searching device: code=" + code);
        }
    });


    class SonyAudioDeviceNode
    {
        constructor(config)
        {
            RED.nodes.createNode(this, config);

            this.name = config.name;
            this.host = config.host;
            this.port = config.port;

            this.subscribers = {};
            this.nextSubscrId = 1;

            this.receivers = {};

            this.on("close", () =>
            {
                Object.values(this.receivers).forEach(receiver =>
                {
                    receiver.disconnect();
                });
            });
        }

        sendRequest(service, method, version, args, resultCb, errorCb)
        {
            const req = {method: "post",
                        uri: "http://" + this.host + ":" + this.port + "/sony/" + service,
                        json: true,
                        body: {id: 1,
                               method: method,
                               version: version,
                               params: (args == null) ? [] : [args]}};

            // this.debug(JSON.stringify(req));
            httpRequest(req)
            .then(response =>
            {
                if ("result" in response)
                {
                    let respMsg = {service: service,
                                   method: method,
                                   version: version,
                                   payload: (response.result.length == 1) ? response.result[0] : null};

                    // this.debug(JSON.stringify(respMsg));
                    resultCb(respMsg);
                }
                else if ("error" in response)
                {
                    errorCb(response.error[1] + " (" + response.error[0] + ")");
                }
            })
            .catch(error =>
            {
                errorCb(error);
            });
        }

        subscribeEvents(service, filter, callback)
        {
            this.debug("Subscribing for service '" + service + "' with filter b:" + filter.toString(2).padStart(4, "0"));

            const id = this.nextSubscrId;
            this.nextSubscrId++;

            this.subscribers[id] = {service: service,
                                    filter: filter,
                                    callback: callback};

            if (service in this.receivers)
            {
                this.receivers[service].updateEventMask(calculateEventMask(this.subscribers, service));
            }
            else
            {
                let receiver = new EventReceiver(service, this);

                receiver.on("status", status =>
                {
                    this.emit("sony.status", status);
                });

                receiver.connect(calculateEventMask(this.subscribers, service), (method, msg) =>
                {
                    Object.values(this.subscribers).forEach(subscriber =>
                    {
                        if ((msg.service == subscriber.service) && ((method & subscriber.filter) != 0))
                        {
                            subscriber.callback(msg);
                        }
                    });
                });

                this.receivers[service] = receiver;
            }

            this.debug("Successfully subscribed, subscriber ID is " + id);
            return id;
        }

        unsubscribeEvents(id)
        {
            if (id in this.subscribers)
            {
                this.debug("Unsubscribing subscriber with ID " + id);

                const service = this.subscribers[id].service;
                delete this.subscribers[id];

                let found = false;
                for (const subscriber of Object.values(this.subscribers))
                {
                    if (subscriber.service == service)
                    {
                        found = true;
                        break;
                    }
                }

                if (found)
                {
                    this.receivers[service].updateEventMask(calculateEventMask(this.subscribers, service));
                }
                else
                {
                    this.debug("Last subscriber for service '" + service + "' vanished");

                    this.receivers[service].disconnect();
                    delete this.receivers[service];
                }
            }
            else
            {
                this.warn("Unknown subscriber with ID " + id);
            }
        }
    }

    function calculateEventMask(subscribers, service)
    {
        var ret = 0;

        Object.values(subscribers).forEach(subscriber =>
        {
            if (subscriber.service == service)
            {
                ret = ret | subscriber.filter;
            }
        });

        return ret;
    }

    RED.nodes.registerType("sony-audio-device", SonyAudioDeviceNode);
};
