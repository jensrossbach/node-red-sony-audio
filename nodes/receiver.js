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
    const STATUS_UNCONFIGURED = {fill: "yellow", shape: "dot", text: "node-red-contrib-sony-audio/sony-audio-device:common.status.unconfigured"};
    const STATUS_CONNECTING   = {fill: "grey",   shape: "dot", text: "receiver.status.connecting"                                              };

    const APIFilter = require("./common/api_filter.js");
    const Events = require("./common/event_constants.js");


    function SonyAudioReceiverNode(config)
    {
        let node = this;
        RED.nodes.createNode(node, config);

        node.config = config;
        node.name = config.name;

        node.device = RED.nodes.getNode(config.device);
        if (node.device && (node.config.outputs > 0))
        {
            let filter = 0;

            switch (config.service)
            {
                case "system":
                {
                    if (config.notifyPowerStatus)
                    {
                        filter = filter | Events.EVENT_SYSTEM_NOTIFY_POWER_STATUS;
                    }
                    if (config.notifyStorageStatus)
                    {
                        filter = filter | Events.EVENT_SYSTEM_NOTIFY_STORAGE_STATUS;
                    }
                    if (config.notifySettingsUpdate)
                    {
                        filter = filter | Events.EVENT_SYSTEM_NOTIFY_SETTINGS_UPDATE;
                    }
                    if (config.notifySWUpdateInfo)
                    {
                        filter = filter | Events.EVENT_SYSTEM_NOTIFY_SWUPDATE_INFO;
                    }

                    break;
                }
                case "audio":
                {
                    if (config.notifyVolumeInformation)
                    {
                        filter = filter | Events.EVENT_AUDIO_NOTIFY_VOLUME_INFO;
                    }

                    break;
                }
                case "avContent":
                {
                    if (config.notifyExternalTerminalStatus)
                    {
                        filter = filter | Events.EVENT_AVCONTENT_NOTIFY_EXT_TERM_STATUS;
                    }
                    if (config.notifyAvailablePlaybackFunction)
                    {
                        filter = filter | Events.EVENT_AVCONTENT_NOTIFY_AVAIL_PB_FUNCTION;
                    }
                    if (config.notifyPlayingContentInfo)
                    {
                        filter = filter | Events.EVENT_AVCONTENT_NOTIFY_PLAYING_CONTENT_INFO;
                    }

                    break;
                }
            }

            node.device.on("sony.status", status =>
            {
                node.status(status);
            });

            node.status(STATUS_CONNECTING);
            node.subscribeId = node.device.subscribeEvents(config.service, filter, msg =>
            {
                sendEvent(msg);
            });

            node.on("close", () =>
            {
                node.device.unsubscribeEvents(node.subscribeId);
            });
        }
        else
        {
            node.status(STATUS_UNCONFIGURED);
        }

        function sendEvent(eventMsg)
        {
            let filteredMsgs = [];

            if (node.config.outFilters && (eventMsg.payload != null))
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

        function createOuputArray(filterMsgs, eventMsg)
        {
            let arr = [];

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
    }

    RED.nodes.registerType("sony-audio-receiver", SonyAudioReceiverNode);
};
