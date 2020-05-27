/*
 * Copyright (c) 2020 Jens-Uwe Rossbach
 *
 * This code is licensed under the MIT License.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of node software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and node permission notice shall be included in all
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
    const STATUS_TEMP_DURATION = 5000;

    const STATUS_UNCONFIGURED  = {fill: "yellow", shape: "dot", text: "controller.status.unconfigured"       };
    const STATUS_MISCONFIGURED = {fill: "yellow", shape: "dot", text: "controller.status.configurationErrors"};
    const STATUS_SENDING       = {fill: "grey",   shape: "dot", text: "controller.status.sending"            };
    const STATUS_SUCCESS       = {fill: "green",  shape: "dot", text: "controller.status.success"            };
    const STATUS_ERROR         = {fill: "red",    shape: "dot", text: "controller.status.error"              };

    const APIFilter = require("../libs/sony-api-filter");


    function SonyAudioControllerNode(config)
    {
        var node = this;

        RED.nodes.createNode(node, config);

        node.config = config;
        node.name = config.name;
        node.device = RED.nodes.getNode(config.device);

        node.timeout = null;

        function getAPIFromTopic(topic)
        {
            const TOPIC_REGEX = /^([a-zA-Z]+)\/([a-zA-Z]+)\/([0-9]+\.[0-9]+)$/;

            var matches = topic.match(TOPIC_REGEX);
            var api = null;

            if (matches != null)
            {
                api = {service: matches[1], method: matches[2], version: matches[3]};
            }

            return api;
        }

        function getAPIFromMessage(msg)
        {
            var api = null;

            if ((typeof msg.service == "string") &&
                (typeof msg.method == "string") &&
                (typeof msg.version == "string"))
            {
                api = {service: msg.service, method: msg.method, version: msg.version};
            }

            return api;
        }

        function setPowerStatus(context, status)
        {
            sendRequest(context,
                        "system",
                        "setPowerStatus",
                        "1.1",
                        {status: status});
        }

        function setAudioVolume(context, volume, relative = false, zone = 0)
        {
            sendRequest(context,
                        "audio",
                        "setAudioVolume",
                        "1.1",
                        {output: (zone > 0) ? "extOutput:zone?zone=" + zone : "",
                         volume: (relative && (volume > 0)) ? "+" + volume : volume.toString()});
        }

        function setAudioMute(context, mute, zone = 0)
        {
            sendRequest(context,
                        "audio",
                        "setAudioMute",
                        "1.1",
                        {output: (zone > 0) ? "extOutput:zone?zone=" + zone : "",
                         mute: mute});
        }

        function setSoundSettings(context, params)
        {
            sendRequest(context,
                        "audio",
                        "setSoundSettings",
                        "1.1",
                        {settings: params});
        }

        function setPlaybackModeSettings(context, params)
        {
            sendRequest(context,
                        "avContent",
                        "setPlaybackModeSettings",
                        "1.0",
                        {settings: params});
        }

        function setPlayContent(context, source, port = 0, zone = 0)
        {
            var uri = source;
            if (((source == "extInput:hdmi") || (source == "extInput:line")) && (port > 0))
            {
                uri += "?port=" + port;
            }

            sendRequest(context,
                        "avContent",
                        "setPlayContent",
                        "1.2",
                        {output: (zone > 0) ? "extOutput:zone?zone=" + zone : "",
                         uri: uri});
        }

        function stopPlayingContent(context, zone = 0)
        {
            sendRequest(context,
                        "avContent",
                        "stopPlayingContent",
                        "1.1",
                        {output: (zone > 0) ? "extOutput:zone?zone=" + zone : ""});
        }

        function pausePlayingContent(context, zone = 0)
        {
            sendRequest(context,
                        "avContent",
                        "pausePlayingContent",
                        "1.1",
                        {output: (zone > 0) ? "extOutput:zone?zone=" + zone : ""});
        }

        function setPlayPreviousContent(context, zone = 0)
        {
            sendRequest(context,
                        "avContent",
                        "setPlayPreviousContent",
                        "1.0",
                        {output: (zone > 0) ? "extOutput:zone?zone=" + zone : ""});
        }

        function setPlayNextContent(context, zone = 0)
        {
            sendRequest(context,
                        "avContent",
                        "setPlayNextContent",
                        "1.0",
                        {output: (zone > 0) ? "extOutput:zone?zone=" + zone : ""});
        }

        function scanPlayingContent(context, fwd, zone = 0)
        {
            sendRequest(context,
                        "avContent",
                        "scanPlayingContent",
                        "1.0",
                        {direction: fwd ? "fwd" : "bwd",
                         output: (zone > 0) ? "extOutput:zone?zone=" + zone : ""});
        }

        function getPowerStatus(context)
        {
            sendRequest(context,
                        "system",
                        "getPowerStatus",
                        "1.1",
                        null);
        }

        function getSWUpdateInfo(context, network)
        {
            sendRequest(context,
                        "system",
                        "getSWUpdateInfo",
                        "1.0",
                        {network: network ? "true" : "false"});
        }

        function getPlayingContentInfo(context, zone = 0)
        {
            sendRequest(context,
                        "avContent",
                        "getPlayingContentInfo",
                        "1.2",
                        {output: (zone > 0) ? "extOutput:zone?zone=" + zone : ""});
        }

        function getVolumeInfo(context, zone = 0)
        {
            sendRequest(context,
                        "audio",
                        "getVolumeInformation",
                        "1.1",
                        {output: (zone > 0) ? "extOutput:zone?zone=" + zone : ""});
        }

        function getSoundSettings(context, target)
        {
            sendRequest(context,
                        "audio",
                        "getSoundSettings",
                        "1.1",
                        {target: target});
        }

        function getPlaybackModeSettings(context, target)
        {
            sendRequest(context,
                        "avContent",
                        "getPlaybackModeSettings",
                        "1.0",
                        {target: target});
        }

        function setStatus(stat = {}, duration = 0)
        {
            if (node.timeout != null)
            {
                clearTimeout(node.timeout);
                node.timeout = null;
            }

            node.status(stat);

            if (duration > 0)
            {
                node.timeout = setTimeout(() =>
                {
                    node.status({});
                    node.timeout = null;
                }, duration);
            }
        }

        function createOuputArray(context, filterMsgs, respMsg)
        {
            var arr = [];

            if (node.config.outFilters)
            {
                for (let i=0; i<filterMsgs.length; ++i)
                {
                    if ((filterMsgs[i] != null) &&
                        (typeof context.command == "string"))
                    {
                        filterMsgs[i].command = context.command;
                    }

                    arr.push(filterMsgs[i]);
                }
            }

            if (node.config.outResponse)
            {
                arr.push(respMsg);
            }

            return arr;
        }

        function sendRequest(context, service, method, version, args)
        {
            setStatus(STATUS_SENDING);

            node.device.sendRequest(service, method, version, args, respMsg =>
            {
                sendResponse(context, respMsg);
                setStatus(STATUS_SUCCESS, STATUS_TEMP_DURATION);

                context.done();
            }, error =>
            {
                setStatus(STATUS_ERROR, STATUS_TEMP_DURATION);
                context.error(error);
            });
        }

        function sendResponse(context, respMsg)
        {
            var filteredMsgs = [];

            if (node.config.outFilters && (respMsg.payload != null))
            {
                for (let i=0; i<node.config.outputPorts.length; ++i)
                {
                    if ("filter" in node.config.outputPorts[i])
                    {
                        let filter = {name: ""};

                        if ((node.config.outputPorts[i].filter.name == "auto") &&
                            (typeof context.command == "string"))
                        {
                            switch (context.command)
                            {
                                case "getPowerStatus":
                                {
                                    if (typeof context.suffix == "string")
                                    {
                                        switch (context.suffix)
                                        {
                                            case "powered":
                                            {
                                                filter = {name: "powered", explicit: false};
                                                break;
                                            }
                                            case "poweredExplicit":
                                            {
                                                filter = {name: "powered", explicit: true};
                                                break;
                                            }
                                            case "standby":
                                            {
                                                filter = {name: "standby", explicit: false};
                                                break;
                                            }
                                            case "standbyExplicit":
                                            {
                                                filter = {name: "standby", explicit: true};
                                                break;
                                            }
                                        }
                                    }
                                    else
                                    {
                                        filter = {name: "powered", explicit: false};
                                    }

                                    break;
                                }
                                case "getSWUpdateInfo":
                                {
                                    if (context.suffix === "explicit")
                                    {
                                        filter = {name: "swupdate", explicit: true};
                                    }
                                    else
                                    {
                                        filter = {name: "swupdate", explicit: false};
                                    }

                                    break;
                                }
                                case "getSource":
                                {
                                    filter = {name: "source"};
                                    break;
                                }
                                case "getVolumeInfo":
                                {
                                    if (typeof context.suffix == "string")
                                    {
                                        switch (context.suffix)
                                        {
                                            case "absolute":
                                            {
                                                filter = {name: "absoluteVolume"};
                                                break;
                                            }
                                            case "relative":
                                            {
                                                filter = {name: "relativeVolume"};
                                                break;
                                            }
                                            case "muted":
                                            {
                                                filter = {name: "muted"};
                                                break;
                                            }
                                        }
                                    }
                                    else
                                    {
                                        filter = {name: "absoluteVolume"};
                                    }

                                    break;
                                }
                                case "getSoundSettings":
                                {
                                    filter = {name: "soundSetting"};
                                    break;
                                }
                                case "getPlaybackModes":
                                {
                                    filter = {name: "playbackMode"};
                                    break;
                                }
                            }
                        }
                        else
                        {
                            filter = node.config.outputPorts[i].filter;
                        }

                        filteredMsgs.push(APIFilter.filterData(respMsg, filter));
                    }
                }
            }

            if (node.config.outFilters || node.config.outResponse)
            {
                context.send(createOuputArray(context, filteredMsgs, respMsg));
            }
        }

        if (node.device)
        {
            if ((node.config.outputs == 0) ||
                ((node.config.command == "setSoundSettings") &&
                 (node.config.soundSettings.length == 0)) ||
                ((node.config.command == "setPlaybackModes") &&
                 (node.config.modeSettings.length == 0)))
            {
                setStatus(STATUS_MISCONFIGURED);
            }
            else
            {
                setStatus();
            }

            node.on("input", function(msg, send, done)
            {
                var context = {msg: msg};

                if (send)
                {
                    context.send = send;
                }
                else
                {
                    // Node-RED 0.x backwards compatibility
                    context.send = function() { node.send.apply(node, arguments); };
                }

                if (done)
                {
                    context.done = done;
                    context.error = done;
                }
                else
                {
                    // Node-RED 0.x backwards compatibility
                    context.done = function() {};
                    context.error = function()
                    {
                        var args = [...arguments];
                        args.push(msg);
                        node.error.apply(node, args);
                    };
                }

                var api = null;
                var cmd = null;
                if (node.config.enableTopic && msg.topic && (typeof msg.topic == "string"))
                {
                    api = getAPIFromTopic(msg.topic);

                    if (!api)
                    {
                        cmd = msg.topic;
                    }
                }

                if (!api)
                {
                    api = getAPIFromMessage(msg);
                }

                if (api)
                {
                    sendRequest(context,
                                api.service,
                                api.method,
                                api.version,
                                msg.payload);
                }
                else
                {
                    if (!cmd)
                    {
                        cmd = (typeof msg.command == "string") ? msg.command : node.config.command;
                    }

                    let parts = cmd.split(":");
                    context.command = parts[0];
                    if (parts.length > 1)
                    {
                        context.suffix = parts[1];
                    }

                    switch (context.command)
                    {
                        case "powerOn":
                        {
                            setPowerStatus(context, "active");
                            break;
                        }
                        case "powerOff":
                        {
                            setPowerStatus(context, "off");
                            break;
                        }
                        case "setVolume":
                        {
                            let args = {volume: node.config.volume,
                                        relativeVolume: node.config.relativeVolume,
                                        zone: node.config.zone};

                            if (typeof msg.payload == "object")
                            {
                                if (typeof msg.payload.volume == "object")
                                {
                                    if (typeof msg.payload.volume.absolute == "number")
                                    {
                                        args.volume = msg.payload.volume.absolute;
                                        args.relativeVolume = false;
                                    }

                                    if (typeof msg.payload.volume.relative == "number")
                                    {
                                        args.volume = msg.payload.volume.relative;
                                        args.relativeVolume = true;
                                    }
                                }

                                if (typeof msg.payload.zone == "number")
                                {
                                    args.zone = msg.payload.zone;
                                }
                            }
                            else if (typeof msg.payload == "number")
                            {
                                args.volume = msg.payload;

                                if (context.suffix === "absolute")
                                {
                                    args.relativeVolume = false;
                                }
                                else if (context.suffix === "relative")
                                {
                                    args.relativeVolume = true;
                                }
                            }

                            if ((args.relativeVolume && (args.volume == 0)) ||
                                (!args.relativeVolume && (args.volume < 0)))
                            {
                                setStatus(STATUS_ERROR, STATUS_TEMP_DURATION);
                                context.error("Invalid " + (args.relativeVolume ? "relative" : "absolute") + " volume: " + args.volume);

                                break;
                            }

                            setAudioVolume(context, args.volume, args.relativeVolume, args.zone);
                            break;
                        }
                        case "mute":
                        {
                            let args = {zone: node.config.zone};

                            if ((typeof msg.payload == "object") &&
                                (typeof msg.payload.zone == "number"))
                            {
                                args.zone = msg.payload.zone;
                            }

                            setAudioMute(context, "on", args.zone);
                            break;
                        }
                        case "unmute":
                        {
                            let args = {zone: node.config.zone};

                            if ((typeof msg.payload == "object") &&
                                (typeof msg.payload.zone == "number"))
                            {
                                args.zone = msg.payload.zone;
                            }

                            setAudioMute(context, "off", args.zone);
                            break;
                        }
                        case "toggleMute":
                        {
                            let args = {zone: node.config.zone};

                            if ((typeof msg.payload == "object") &&
                                (typeof msg.payload.zone == "number"))
                            {
                                args.zone = msg.payload.zone;
                            }

                            setAudioMute(context, "toggle", args.zone);
                            break;
                        }
                        case "setSoundSettings":
                        {
                            let args = {soundSettings: node.config.soundSettings};

                            if ((typeof msg.payload == "object") &&
                                Array.isArray(msg.payload.settings))
                            {
                                args.soundSettings = msg.payload.settings;
                            }

                            setSoundSettings(context, args.soundSettings);
                            break;
                        }
                        case "setSource":
                        {
                            let args = {source: node.config.source,
                                        port: node.config.port,
                                        zone: node.config.zone};

                            if (typeof msg.payload == "object")
                            {
                                if (typeof msg.payload.source == "object")
                                {
                                    if ((typeof msg.payload.source.scheme == "string") &&
                                        (typeof msg.payload.source.resource == "string"))
                                    {
                                        args.source = msg.payload.source.scheme + ":" + msg.payload.source.resource;
                                    }

                                    if (typeof msg.payload.source.port == "number")
                                    {
                                        args.port = msg.payload.source.port;
                                    }
                                }

                                if (typeof msg.payload.zone == "number")
                                {
                                    args.zone = msg.payload.zone;
                                }
                            }

                            setPlayContent(context, args.source, args.port, args.zone);
                            break;
                        }
                        case "setPlaybackModes":
                        {
                            let args = {modeSettings: node.config.modeSettings};

                            if ((typeof msg.payload == "object") &&
                                Array.isArray(msg.payload.settings))
                            {
                                args.modeSettings = msg.payload.settings;
                            }

                            setPlaybackModeSettings(context, args.modeSettings);
                            break;
                        }
                        case "stop":
                        {
                            let args = {zone: node.config.zone};

                            if ((typeof msg.payload == "object") &&
                                (typeof msg.payload.zone == "number"))
                            {
                                args.zone = msg.payload.zone;
                            }

                            stopPlayingContent(context, args.zone);
                            break;
                        }
                        case "togglePause":
                        {
                            let args = {zone: node.config.zone};

                            if ((typeof msg.payload == "object") &&
                                (typeof msg.payload.zone == "number"))
                            {
                                args.zone = msg.payload.zone;
                            }

                            pausePlayingContent(context, args.zone);
                            break;
                        }
                        case "skipPrev":
                        {
                            let args = {zone: node.config.zone};

                            if ((typeof msg.payload == "object") &&
                                (typeof msg.payload.zone == "number"))
                            {
                                args.zone = msg.payload.zone;
                            }

                            setPlayPreviousContent(context, args.zone);
                            break;
                        }
                        case "skipNext":
                        {
                            let args = {zone: node.config.zone};

                            if ((typeof msg.payload == "object") &&
                                (typeof msg.payload.zone == "number"))
                            {
                                args.zone = msg.payload.zone;
                            }

                            setPlayNextContent(context, args.zone);
                            break;
                        }
                        case "scanBackward":
                        {
                            let args = {zone: node.config.zone};

                            if ((typeof msg.payload == "object") &&
                                (typeof msg.payload.zone == "number"))
                            {
                                args.zone = msg.payload.zone;
                            }

                            scanPlayingContent(context, false, args.zone);
                            break;
                        }
                        case "scanForward":
                        {
                            let args = {zone: node.config.zone};

                            if ((typeof msg.payload == "object") &&
                                (typeof msg.payload.zone == "number"))
                            {
                                args.zone = msg.payload.zone;
                            }

                            scanPlayingContent(context, true, args.zone);
                            break;
                        }
                        case "getPowerStatus":
                        {
                            getPowerStatus(context);
                            break;
                        }
                        case "getSWUpdateInfo":
                        {
                            let args = {network: node.config.networkUpdate};

                            if ((typeof msg.payload == "object") &&
                                (typeof msg.payload.network == "boolean"))
                            {
                                args.network = msg.payload.network;
                            }

                            getSWUpdateInfo(context, args.network);
                            break;
                        }
                        case "getSource":
                        {
                            let args = {zone: node.config.zone};

                            if ((typeof msg.payload == "object") &&
                                (typeof msg.payload.zone == "number"))
                            {
                                args.zone = msg.payload.zone;
                            }

                            getPlayingContentInfo(context, args.zone);
                            break;
                        }
                        case "getVolumeInfo":
                        {
                            let args = {zone: node.config.zone};

                            if ((typeof msg.payload == "object") &&
                                (typeof msg.payload.zone == "number"))
                            {
                                args.zone = msg.payload.zone;
                            }

                            getVolumeInfo(context, args.zone);
                            break;
                        }
                        case "getSoundSettings":
                        {
                            let args = {target: (node.config.soundTarget == "all") ? "" : node.config.soundTarget};

                            if ((typeof msg.payload == "object") &&
                                (typeof msg.payload.target == "string"))
                            {
                                args.target = (msg.payload.target == "all") ? "" : msg.payload.target;
                            }

                            getSoundSettings(context, args.target);
                            break;
                        }
                        case "getPlaybackModes":
                        {
                            let args = {target: (node.config.modeTarget == "all") ? "" : node.config.modeTarget};

                            if ((typeof msg.payload == "object") &&
                                (typeof msg.payload.target == "string"))
                            {
                                args.target = (msg.payload.target == "all") ? "" : msg.payload.target;
                            }

                            getPlaybackModeSettings(context, args.target);
                            break;
                        }
                        default:
                        {
                            setStatus(STATUS_ERROR, STATUS_TEMP_DURATION);
                            context.error("Invalid command: " + context.command);

                            break;
                        }
                    }
                }
            });

            node.on("close", function()
            {
                if (node.timeout != null)
                {
                    clearTimeout(node.timeout);
                    node.timeout = null;
                }
            });
        }
        else
        {
            setStatus(STATUS_UNCONFIGURED);
        }
    }

    RED.nodes.registerType("sony-audio-controller", SonyAudioControllerNode);
};
