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


module.exports = function(RED)
{
    function SonyAudioNotifyNode(config)
    {
        const STATUS_UNCONFIGURED  = {fill: "yellow", shape: "dot", text: "@jens_rossbach/node-red-sony-audio/sonyaudio-device:common.status.unconfigured" };
        const STATUS_MISCONFIGURED = {fill: "yellow", shape: "dot", text: "@jens_rossbach/node-red-sony-audio/sonyaudio-device:common.status.misconfigured"};
        const STATUS_CONNECTING    = {fill: "grey",   shape: "dot", text: "notify.status.connecting"                                                       };

        const Utils = require("./common/utils.js");
        const Events = require("./common/event_constants.js");

        const node = this;
        RED.nodes.createNode(node, config);

        node.output = [];

        node.device = RED.nodes.getNode(config.device);
        if (!node.device)
        {
            node.error(RED._("@jens_rossbach/node-red-sony-audio/sonyaudio-device:common.error.unconfigured"));
            node.status(STATUS_UNCONFIGURED);
        }
        else if (!Utils.validateOutputProperties(RED, node, config.outputProperties, node.output, false))
        {
            node.status(STATUS_MISCONFIGURED);
        }
        else
        {
            let filter = 0;

            switch (config.service)
            {
                case "system":
                {
                    if (config.events.includes("notifyPowerStatus"))
                    {
                        filter = filter | Events.EVENT_SYSTEM_NOTIFY_POWER_STATUS;
                    }
                    if (config.events.includes("notifyStorageStatus"))
                    {
                        filter = filter | Events.EVENT_SYSTEM_NOTIFY_STORAGE_STATUS;
                    }
                    if (config.events.includes("notifySettingsUpdate"))
                    {
                        filter = filter | Events.EVENT_SYSTEM_NOTIFY_SETTINGS_UPDATE;
                    }
                    if (config.events.includes("notifySWUpdateInfo"))
                    {
                        filter = filter | Events.EVENT_SYSTEM_NOTIFY_SWUPDATE_INFO;
                    }

                    break;
                }
                case "audio":
                {
                    if (config.events.includes("notifyVolumeInformation"))
                    {
                        filter = filter | Events.EVENT_AUDIO_NOTIFY_VOLUME_INFO;
                    }

                    break;
                }
                case "avContent":
                {
                    if (config.events.includes("notifyExternalTerminalStatus"))
                    {
                        filter = filter | Events.EVENT_AVCONTENT_NOTIFY_EXT_TERM_STATUS;
                    }
                    if (config.events.includes("notifyAvailablePlaybackFunction"))
                    {
                        filter = filter | Events.EVENT_AVCONTENT_NOTIFY_AVAIL_PB_FUNCTION;
                    }
                    if (config.events.includes("notifyPlayingContentInfo"))
                    {
                        filter = filter | Events.EVENT_AVCONTENT_NOTIFY_PLAYING_CONTENT_INFO;
                    }

                    break;
                }
            }

            if (filter == 0)
            {
                node.error(RED._("notify.error.noEvents"));
                node.status(STATUS_MISCONFIGURED);
            }
            else
            {
                node.device.on("sony.status", status =>
                {
                    node.status(status);
                });

                node.status(STATUS_CONNECTING);
                node.subscribeId = node.device.subscribeEvents(config.service, filter, data =>
                {
                    let out = Utils.prepareOutput(RED, node, node.output, null, data, config.sendIfPayload);
                    if (out)
                    {
                        node.send(out);
                    }
                });

                node.on("close", () =>
                {
                    node.device.unsubscribeEvents(node.subscribeId);
                });
            }
        }
    }

    RED.nodes.registerType("sonyaudio-notify", SonyAudioNotifyNode);
};
