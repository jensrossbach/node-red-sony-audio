/*
 * Copyright (c) 2021 Jens-Uwe Rossbach
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

    const STATUS_UNCONFIGURED  = {fill: "yellow", shape: "dot", text: "node-red-contrib-sony-audio/sony-audio-device:common.status.unconfigured"};
    const STATUS_MISCONFIGURED = {fill: "yellow", shape: "dot", text: "controller.status.configurationErrors"                                   };
    const STATUS_SENDING       = {fill: "grey",   shape: "dot", text: "controller.status.sending"                                               };
    const STATUS_SUCCESS       = {fill: "green",  shape: "dot", text: "controller.status.success"                                               };
    const STATUS_ERROR         = {fill: "red",    shape: "dot", text: "controller.status.error"                                                 };

    const Handlebars = require("handlebars");
    const APIFilter = require("./common/api_filter.js");


    function SonyAudioControllerNode(config)
    {
        let node = this;

        RED.nodes.createNode(node, config);

        node.config = config;
        node.name = config.name;
        node.device = RED.nodes.getNode(config.device);

        node.applyTemplate = node.config.topic ? Handlebars.compile(node.config.topic) : null;
        node.timeout = null;

        // backward compatibility
        if (typeof node.config.enableLowLevel == "undefined") { node.config.enableLowLevel = true; }
        if (typeof node.config.preset == "undefined") { node.config.preset = 0; }

        if (node.device)
        {
            if (((node.config.command == "setSoundSettings") &&
                 (node.config.soundSettings.length == 0)) ||
                ((node.config.command == "setSpeakerSettings") &&
                 (node.config.speakerSettings.length == 0)) ||
                (((node.config.command == "setPlaybackSettings") ||
                  (node.config.command == "setPlaybackModes")) &&  // backward compatibility
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
                let context = {msg: msg};

                if (send)
                {
                    context.send = send;
                }
                else
                {
                    // Node-RED 0.x backward compatibility
                    context.send = function() { node.send.apply(node, arguments); };
                }

                if (done)
                {
                    context.done = done;
                    context.error = done;
                }
                else
                {
                    // Node-RED 0.x backward compatibility
                    context.done = function() {};
                    context.error = function()
                    {
                        let args = [...arguments];
                        args.push(msg);
                        node.error.apply(node, args);
                    };
                }

                let api = null;
                let cmd = null;
                if (node.config.enableTopic && msg.topic && (typeof msg.topic == "string"))
                {
                    api = getAPIFromTopic(msg.topic);

                    if (!api)
                    {
                        cmd = msg.topic;
                    }
                }

                if (!api && node.config.enableLowLevel)
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
                        case "standBy":
                        {
                            setPowerStatus(context, "standby");
                            break;
                        }
                        case "reconnect":
                        {
                            node.device.reconnect();
                            break;
                        }
                        case "setVolume":
                        {
                            let args = {volume: parseInt(node.config.volume),
                                        relativeVolume: node.config.relativeVolume,
                                        zone: parseInt(node.config.zone)};

                            if (msg.payload && (typeof msg.payload == "object"))
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
                            let args = {zone: parseInt(node.config.zone)};

                            if (msg.payload &&
                                (typeof msg.payload == "object") &&
                                (typeof msg.payload.zone == "number"))
                            {
                                args.zone = msg.payload.zone;
                            }

                            setAudioMute(context, "on", args.zone);
                            break;
                        }
                        case "unmute":
                        {
                            let args = {zone: parseInt(node.config.zone)};

                            if (msg.payload &&
                                (typeof msg.payload == "object") &&
                                (typeof msg.payload.zone == "number"))
                            {
                                args.zone = msg.payload.zone;
                            }

                            setAudioMute(context, "off", args.zone);
                            break;
                        }
                        case "toggleMute":
                        {
                            let args = {zone: parseInt(node.config.zone)};

                            if (msg.payload &&
                                (typeof msg.payload == "object") &&
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

                            if (msg.payload &&
                                (typeof msg.payload == "object") &&
                                Array.isArray(msg.payload.settings))
                            {
                                args.soundSettings = msg.payload.settings;
                            }

                            setSoundSettings(context, args.soundSettings);
                            break;
                        }
                        case "setSpeakerSettings":
                        {
                            let args = {speakerSettings: node.config.speakerSettings};

                            if (msg.payload &&
                                (typeof msg.payload == "object") &&
                                Array.isArray(msg.payload.settings))
                            {
                                args.speakerSettings = msg.payload.settings;
                            }

                            setSpeakerSettings(context, args.speakerSettings);
                            break;
                        }
                        case "setSource":
                        {
                            let args = {source: node.config.source,
                                        port: parseInt(node.config.port),
                                        preset: parseInt(node.config.preset),
                                        zone: parseInt(node.config.zone)};

                            if (msg.payload && (typeof msg.payload == "object"))
                            {
                                if (msg.payload.source && (typeof msg.payload.source == "object"))
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

                                    if (typeof msg.payload.source.preset == "number")
                                    {
                                        args.preset = msg.payload.source.preset;
                                    }
                                }

                                if (typeof msg.payload.zone == "number")
                                {
                                    args.zone = msg.payload.zone;
                                }
                            }

                            setPlayContent(context, args.source, args.port, args.preset, args.zone);
                            break;
                        }
                        case "setPlaybackModes":  // backward compatibility
                        case "setPlaybackSettings":
                        {
                            let args = {modeSettings: node.config.modeSettings};

                            if (msg.payload &&
                                (typeof msg.payload == "object") &&
                                Array.isArray(msg.payload.settings))
                            {
                                args.modeSettings = msg.payload.settings;
                            }

                            setPlaybackModeSettings(context, args.modeSettings);
                            break;
                        }
                        case "stop":
                        {
                            let args = {zone: parseInt(node.config.zone)};

                            if (msg.payload &&
                                (typeof msg.payload == "object") &&
                                (typeof msg.payload.zone == "number"))
                            {
                                args.zone = msg.payload.zone;
                            }

                            stopPlayingContent(context, args.zone);
                            break;
                        }
                        case "togglePause":
                        {
                            let args = {zone: parseInt(node.config.zone)};

                            if (msg.payload &&
                                (typeof msg.payload == "object") &&
                                (typeof msg.payload.zone == "number"))
                            {
                                args.zone = msg.payload.zone;
                            }

                            pausePlayingContent(context, args.zone);
                            break;
                        }
                        case "skipPrev":
                        {
                            let args = {zone: parseInt(node.config.zone)};

                            if (msg.payload &&
                                (typeof msg.payload == "object") &&
                                (typeof msg.payload.zone == "number"))
                            {
                                args.zone = msg.payload.zone;
                            }

                            setPlayPreviousContent(context, args.zone);
                            break;
                        }
                        case "skipNext":
                        {
                            let args = {zone: parseInt(node.config.zone)};

                            if (msg.payload &&
                                (typeof msg.payload == "object") &&
                                (typeof msg.payload.zone == "number"))
                            {
                                args.zone = msg.payload.zone;
                            }

                            setPlayNextContent(context, args.zone);
                            break;
                        }
                        case "scanBackward":
                        {
                            let args = {zone: parseInt(node.config.zone)};

                            if (msg.payload &&
                                (typeof msg.payload == "object") &&
                                (typeof msg.payload.zone == "number"))
                            {
                                args.zone = msg.payload.zone;
                            }

                            scanPlayingContent(context, false, args.zone);
                            break;
                        }
                        case "scanForward":
                        {
                            let args = {zone: parseInt(node.config.zone)};

                            if (msg.payload &&
                                (typeof msg.payload == "object") &&
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

                            if (msg.payload &&
                                (typeof msg.payload == "object") &&
                                (typeof msg.payload.network == "boolean"))
                            {
                                args.network = msg.payload.network;
                            }

                            getSWUpdateInfo(context, args.network);
                            break;
                        }
                        case "getSource":
                        {
                            let args = {zone: parseInt(node.config.zone)};

                            if (msg.payload &&
                                (typeof msg.payload == "object") &&
                                (typeof msg.payload.zone == "number"))
                            {
                                args.zone = msg.payload.zone;
                            }

                            getPlayingContentInfo(context, args.zone);
                            break;
                        }
                        case "getVolumeInfo":
                        {
                            let args = {zone: parseInt(node.config.zone)};

                            if (msg.payload &&
                                (typeof msg.payload == "object") &&
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

                            if (msg.payload &&
                                (typeof msg.payload == "object") &&
                                (typeof msg.payload.target == "string"))
                            {
                                args.target = (msg.payload.target == "all") ? "" : msg.payload.target;
                            }

                            getSoundSettings(context, args.target);
                            break;
                        }
                        case "getSpeakerSettings":
                        {
                            let args = {target: (node.config.speakerTarget == "all") ? "" : node.config.speakerTarget};

                            if (msg.payload &&
                                (typeof msg.payload == "object") &&
                                (typeof msg.payload.target == "string"))
                            {
                                args.target = (msg.payload.target == "all") ? "" : msg.payload.target;
                            }

                            getSpeakerSettings(context, args.target);
                            break;
                        }
                        case "getPlaybackModes":  // backward compatibility
                        case "getPlaybackSettings":
                        {
                            let args = {target: (node.config.modeTarget == "all") ? "" : node.config.modeTarget};

                            if (msg.payload &&
                                (typeof msg.payload == "object") &&
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

        function getAPIFromTopic(topic)
        {
            let matches = topic.match(/^([a-zA-Z]+)\/([a-zA-Z]+)\/([0-9]+\.[0-9]+)$/);
            let api = null;

            if (matches)
            {
                api = {service: matches[1], method: matches[2], version: matches[3]};
            }

            return api;
        }

        function getAPIFromMessage(msg)
        {
            let api = null;

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
                        {settings: convertSoundSettings(params)});
        }

        function setSpeakerSettings(context, params)
        {
            sendRequest(context,
                        "audio",
                        "setSpeakerSettings",
                        "1.0",
                        {settings: convertSpeakerSettings(params)});
        }

        function setPlaybackModeSettings(context, params)
        {
            sendRequest(context,
                        "avContent",
                        "setPlaybackModeSettings",
                        "1.0",
                        {settings: params});
        }

        function setPlayContent(context, source, port = 0, preset = -1, zone = 0)
        {
            let uri = source;
            if (((source == "extInput:hdmi") ||
                 (source == "extInput:video") ||
                 (source == "extInput:line")) &&
                (port > 0))
            {
                uri += "?port=" + port;
            }
            else if ((source == "radio:fm") &&
                     (preset >= 0))
            {
                uri += "?contentId=" + preset;
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

        function getSpeakerSettings(context, target)
        {
            sendRequest(context,
                        "audio",
                        "getSpeakerSettings",
                        "1.0",
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

        function convertSoundSettings(settings)
        {
            const ret = [];

            for (let from of settings)
            {
                const to = {};
                to.target = from.target;
                switch (from.target)
                {
                    case "soundField":
                    case "voice":
                    {
                        to.value = from.value;
                        break;
                    }
                    case "clearAudio":
                    case "nightMode":
                    case "footballMode":
                    {
                        if (typeof from.value == "string")
                        {
                            to.value = from.value;
                        }
                        else if (typeof from.value == "boolean")
                        {
                            to.value = from.value ? "on" : "off";
                        }

                        break;
                    }
                }

                ret.push(to);
            }

            return ret;
        }

        function convertSpeakerSettings(settings)
        {
            const ret = [];

            for (let from of settings)
            {
                const to = {};
                to.target = from.target;
                switch (from.target)
                {
                    case "inCeilingSpeakerMode":
                    case "speakerSelection":
                    {
                        to.value = from.value;
                        break;
                    }
                    case "frontLLevel":
                    case "frontRLevel":
                    case "centerLevel":
                    case "surroundLLevel":
                    case "surroundRLevel":
                    case "surroundcBackLevel":
                    case "surroundBackLLevel":
                    case "surroundBackRLevel":
                    case "heightLLevel":
                    case "heightRLevel":
                    case "subwooferLevel":
                    {
                        to.value = from.value.toString();
                        break;
                    }
                }

                ret.push(to);
            }

            return ret;
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
            let arr = [];

            const topicContext =
            {
                host: node.device.host,
                service: respMsg.service,
                method: respMsg.method,
                version: respMsg.version,
                command: context.command ? context.command : ""
            };

            if (node.config.outFilters)
            {
                for (let i=0; i<filterMsgs.length; ++i)
                {
                    addTopic(filterMsgs[i], context.msg.topic, topicContext);
                    arr.push(filterMsgs[i]);
                }
            }

            if (node.config.outResponse)
            {
                addTopic(respMsg, context.msg.topic, topicContext);
                arr.push(respMsg);
            }

            return arr;
        }

        function addTopic(msg, origTopic, ctx)
        {
            if (msg)
            {
                if (node.applyTemplate)
                {
                    msg.topic = node.applyTemplate(ctx);
                }
                else if (origTopic)
                {
                    msg.topic = origTopic;
                }
            }
        }

        function sendRequest(context, service, method, version, args)
        {
            setStatus(STATUS_SENDING);

            node.device.sendRequest(service, method, version, args)
            .then(respMsg =>
            {
                sendResponse(context, respMsg);
                setStatus(STATUS_SUCCESS, STATUS_TEMP_DURATION);

                context.done();
            })
            .catch(error =>
            {
                setStatus(STATUS_ERROR, STATUS_TEMP_DURATION);
                context.error(error);
            });
        }

        function sendResponse(context, respMsg)
        {
            let filteredMsgs = [];

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
                                case "getSpeakerSettings":
                                {
                                    filter = {name: "speakerSetting"};
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

                        filteredMsgs.push(APIFilter.filterData(RED, node, respMsg, filter, context.msg));
                    }
                }
            }

            if (node.config.outFilters || node.config.outResponse)
            {
                context.send(createOuputArray(context, filteredMsgs, respMsg));
            }
        }
    }

    RED.nodes.registerType("sony-audio-controller", SonyAudioControllerNode);
};
