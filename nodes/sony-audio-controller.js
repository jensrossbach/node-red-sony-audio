/*
 * Copyright (c) 2019 Jens-Uwe Rossbach
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

    const STATUS_UNCONFIGURED  = {fill: "yellow", shape: "dot", text: "unconfigured"        };
    const STATUS_MISCONFIGURED = {fill: "yellow", shape: "dot", text: "configuration errors"};
    const STATUS_SENDING       = {fill: "grey",   shape: "dot", text: "sending"             };
    const STATUS_SUCCESS       = {fill: "green",  shape: "dot", text: "success"             };
    const STATUS_ERROR         = {fill: "red",    shape: "dot", text: "error"               };

    const request = require("request-promise");
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

            if (matches !== null)
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

        function setPowerStatus(handler, status)
        {
            sendRequest(handler,
                        "system",
                        "setPowerStatus",
                        "1.1",
                        {status: status});
        }

        function setAudioVolume(handler, volume, relative = false, zone = 0)
        {
            sendRequest(handler,
                        "audio",
                        "setAudioVolume",
                        "1.1",
                        {output: (zone > 0) ? "extOutput:zone?zone=" + zone : "",
                         volume: (relative && (volume > 0)) ? "+" + volume : volume.toString()});
        }

        function setAudioMute(handler, mute, zone = 0)
        {
            sendRequest(handler,
                        "audio",
                        "setAudioMute",
                        "1.1",
                        {output: (zone > 0) ? "extOutput:zone?zone=" + zone : "",
                         mute: mute});
        }

        function setSoundSettings(handler, params)
        {
            sendRequest(handler,
                        "audio",
                        "setSoundSettings",
                        "1.1",
                        {settings: params});
        }

        function setPlaybackModeSettings(handler, params)
        {
            sendRequest(handler,
                        "avContent",
                        "setPlaybackModeSettings",
                        "1.0",
                        {settings: params});
        }

        function setPlayContent(handler, source, port = 0, zone = 0)
        {
            var uri = source;
            if ((source == "extInput:hdmi") && (port > 0))
            {
                uri += "?port=" + port;
            }

            sendRequest(handler,
                        "avContent",
                        "setPlayContent",
                        "1.2",
                        {output: (zone > 0) ? "extOutput:zone?zone=" + zone : "",
                         uri: uri});
        }

        function stopPlayingContent(handler, zone = 0)
        {
            sendRequest(handler,
                        "avContent",
                        "stopPlayingContent",
                        "1.1",
                        {output: (zone > 0) ? "extOutput:zone?zone=" + zone : ""});
        }

        function pausePlayingContent(handler, zone = 0)
        {
            sendRequest(handler,
                        "avContent",
                        "pausePlayingContent",
                        "1.1",
                        {output: (zone > 0) ? "extOutput:zone?zone=" + zone : ""});
        }

        function setPlayPreviousContent(handler, zone = 0)
        {
            sendRequest(handler,
                        "avContent",
                        "setPlayPreviousContent",
                        "1.0",
                        {output: (zone > 0) ? "extOutput:zone?zone=" + zone : ""});
        }

        function setPlayNextContent(handler, zone = 0)
        {
            sendRequest(handler,
                        "avContent",
                        "setPlayNextContent",
                        "1.0",
                        {output: (zone > 0) ? "extOutput:zone?zone=" + zone : ""});
        }

        function scanPlayingContent(handler, fwd, zone = 0)
        {
            sendRequest(handler,
                        "avContent",
                        "scanPlayingContent",
                        "1.0",
                        {direction: fwd ? "fwd" : "bwd",
                         output: (zone > 0) ? "extOutput:zone?zone=" + zone : ""});
        }

        function getPowerStatus(handler)
        {
            sendRequest(handler,
                        "system",
                        "getPowerStatus",
                        "1.1",
                        null);
        }

        function getPlayingContentInfo(handler, zone = 0)
        {
            sendRequest(handler,
                        "avContent",
                        "getPlayingContentInfo",
                        "1.2",
                        {output: (zone > 0) ? "extOutput:zone?zone=" + zone : ""});
        }

        function getVolumeInfo(handler, zone = 0)
        {
            sendRequest(handler,
                        "audio",
                        "getVolumeInformation",
                        "1.1",
                        {output: (zone > 0) ? "extOutput:zone?zone=" + zone : ""});
        }

        function getSoundSettings(handler, target)
        {
            sendRequest(handler,
                        "audio",
                        "getSoundSettings",
                        "1.1",
                        {target: target});
        }

        function getPlaybackModeSettings(handler, target)
        {
            sendRequest(handler,
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

        function createOuputArray(filterMsgs, respMsg)
        {
            var arr = [];

            if (node.config.outFilters)
            {
                for (let i=0; i<filterMsgs.length; ++i)
                {
                    arr.push(filterMsgs[i]);
                }
            }

            if (node.config.outResponse)
            {
                arr.push(respMsg);
            }

            return arr;
        }

        function sendRequest(handler, service, method, version, args)
        {
            setStatus(STATUS_SENDING);

            var req = {method: "post",
                       uri: node.baseURI + "/" + service,
                       json: true,
                       body: {id: 1,
                              method: method,
                              version: version,
                              params: (args == null) ? [] : [args]}};

            request(req)
            .then(response =>
            {
                if ("result" in response)
                {
                    let respMsg = {service: service,
                                   method: method,
                                   version: version,
                                   payload: (response.result.length == 1) ? response.result[0] : null};

                    sendResponse(handler, respMsg);
                    setStatus(STATUS_SUCCESS, STATUS_TEMP_DURATION);

                    handler.done();
                }
                else if ("error" in response)
                {
                    setStatus(STATUS_ERROR, STATUS_TEMP_DURATION);
                    handler.error(response.error[1] + " (" + response.error[0] + ")");
                }
            })
            .catch(error =>
            {
                setStatus(STATUS_ERROR, STATUS_TEMP_DURATION);
                handler.error(error);
            });
        }

        function sendResponse(handler, respMsg)
        {
            var filteredMsgs = [];

            if (node.config.outFilters && (respMsg.payload !== null))
            {
                for (let i=0; i<node.config.outputPorts.length; ++i)
                {
                    if ("filter" in node.config.outputPorts[i])
                    {
                        filteredMsgs.push(APIFilter.filterData(respMsg, node.config.outputPorts[i].filter));
                    }
                }
            }

            if (node.config.outFilters || node.config.outResponse)
            {
                handler.send(createOuputArray(filteredMsgs, respMsg));
            }
        }

        if (node.device)
        {
            node.baseURI = "http://" + node.device.host + ":" + node.device.port + "/sony";

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
                var handler = {};

                if (send)
                {
                    handler.send = send;
                }
                else
                {
                    // Node-RED 0.x backwards compatibility
                    handler.send = function() { node.send.apply(node, arguments); };
                }

                if (done)
                {
                    handler.done = done;
                    handler.error = done;
                }
                else
                {
                    // Node-RED 0.x backwards compatibility
                    handler.done = function() {};
                    handler.error = function()
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
                    sendRequest(handler,
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

                    switch (cmd)
                    {
                        case "powerOn":
                        {
                            setPowerStatus(handler, "active");
                            break;
                        }
                        case "powerOff":
                        {
                            setPowerStatus(handler, "off");
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

                                if ((args.relativeVolume && (args.volume == 0)) ||
                                    (!args.relativeVolume && (args.volume < 0)))
                                {
                                    setStatus(STATUS_ERROR, STATUS_TEMP_DURATION);
                                    handler.error("Invalid " + (args.relativeVolume ? "relative" : "absolute") + " volume: " + args.volume);

                                    break;
                                }
                            }

                            setAudioVolume(handler, args.volume, args.relativeVolume, args.zone);
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

                            setAudioMute(handler, "on", args.zone);
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

                            setAudioMute(handler, "off", args.zone);
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

                            setAudioMute(handler, "toggle", args.zone);
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

                            setSoundSettings(handler, args.soundSettings);
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
                                        args.port = msg.payload.source.port
                                    }
                                }

                                if (typeof msg.payload.zone == "number")
                                {
                                    args.zone = msg.payload.zone;
                                }
                            }

                            setPlayContent(handler, args.source, args.port, args.zone);
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

                            setPlaybackModeSettings(handler, args.modeSettings);
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

                            stopPlayingContent(handler, args.zone);
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

                            pausePlayingContent(handler, args.zone);
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

                            setPlayPreviousContent(handler, args.zone);
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

                            setPlayNextContent(handler, args.zone);
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

                            scanPlayingContent(handler, false, args.zone);
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

                            scanPlayingContent(handler, true, args.zone);
                            break;
                        }
                        case "getPowerStatus":
                        {
                            getPowerStatus(handler, msg);
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

                            getPlayingContentInfo(handler, args.zone);
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

                            getVolumeInfo(handler, args.zone);
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

                            getSoundSettings(handler, args.target);
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

                            getPlaybackModeSettings(handler, args.target);
                            break;
                        }
                        default:
                        {
                            setStatus(STATUS_ERROR, STATUS_TEMP_DURATION);
                            handler.error("Invalid command: " + cmd);

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
}