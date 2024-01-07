/*
 * Copyright (c) 2024 Jens-Uwe Rossbach
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
    function SonyAudioControlNode(config)
    {
        const STATUS_TEMP_DURATION = 5000;

        const STATUS_UNCONFIGURED  = {fill: "yellow", shape: "dot", text: "control.status.unconfigured" };
        const STATUS_MISCONFIGURED = {fill: "yellow", shape: "dot", text: "control.status.misconfigured"};
        const STATUS_SENDING       = {fill: "grey",   shape: "dot", text: "control.status.sending"      };
        const STATUS_SUCCESS       = {fill: "green",  shape: "dot", text: "control.status.success"      };
        const STATUS_ERROR         = {fill: "red",    shape: "dot", text: "control.status.error"        };

        const Utils = require("./common/utils.js");
        const Nunjucks = require("nunjucks");

        const node = this;
        RED.nodes.createNode(node, config);

        node.timeout = null;
        node.output = [];

        node.device = RED.nodes.getNode(config.device);
        if (!node.device)
        {
            node.error(RED._("control.error.unconfigured"));
            setStatus(STATUS_UNCONFIGURED);
        }
        else if (!validateConfiguration()
                    || !Utils.validateOutputProperties(
                                RED,
                                node,
                                config.outputProperties,
                                node.output,
                                true))
        {
            setStatus(STATUS_MISCONFIGURED);
        }
        else
        {
            setStatus();

            node.on("input", async function(msg, send, done)
            {
                const context = {msg: msg};

                if (!send || !done)
                {
                    // no support for Node-RED prior to version 1.0 anymore
                    return;
                }

                context.send = send;
                context.done = done;

                try
                {
                    const request = await createAPICall(context);
                    if (request)
                    {
                        sendRequest(context,
                                    request.service,
                                    request.method,
                                    request.version,
                                    request.params);
                    }
                    else
                    {
                        switch (config.action)
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
                                setStatus(STATUS_SUCCESS, STATUS_TEMP_DURATION);

                                break;
                            }
                            case "setVolume":
                            {
                                setAudioVolume(context, parseInt(config.volume), config.relativeVolume, parseInt(config.zone));
                                break;
                            }
                            case "mute":
                            {
                                setAudioMute(context, "on", parseInt(config.zone));
                                break;
                            }
                            case "unmute":
                            {
                                setAudioMute(context, "off", parseInt(config.zone));
                                break;
                            }
                            case "toggleMute":
                            {
                                setAudioMute(context, "toggle", parseInt(config.zone));
                                break;
                            }
                            case "setSoundSettings":
                            {
                                setSoundSettings(context, config.soundSettings);
                                break;
                            }
                            case "setSpeakerSettings":
                            {
                                setSpeakerSettings(context, config.speakerSettings);
                                break;
                            }
                            case "setSource":
                            {
                                setPlayContent(context, config.source, parseInt(config.port), parseInt(config.preset), parseInt(config.zone));
                                break;
                            }
                            case "setPlaybackSettings":
                            {
                                setPlaybackModeSettings(context, config.modeSettings);
                                break;
                            }
                            case "stop":
                            {
                                stopPlayingContent(context, parseInt(config.zone));
                                break;
                            }
                            case "togglePause":
                            {
                                pausePlayingContent(context, parseInt(config.zone));
                                break;
                            }
                            case "skipPrev":
                            {
                                setPlayPreviousContent(context, parseInt(config.zone));
                                break;
                            }
                            case "skipNext":
                            {
                                setPlayNextContent(context, parseInt(config.zone));
                                break;
                            }
                            case "scanBackward":
                            {
                                scanPlayingContent(context, false, parseInt(config.zone));
                                break;
                            }
                            case "scanForward":
                            {
                                scanPlayingContent(context, true, parseInt(config.zone));
                                break;
                            }
                            case "getPowerStatus":
                            {
                                getPowerStatus(context);
                                break;
                            }
                            case "getSWUpdateInfo":
                            {
                                getSWUpdateInfo(context, config.networkUpdate);
                                break;
                            }
                            case "getSource":
                            {
                                getPlayingContentInfo(context, parseInt(config.zone));
                                break;
                            }
                            case "getVolumeInfo":
                            {
                                getVolumeInfo(context, parseInt(config.zone));
                                break;
                            }
                            case "getSoundSettings":
                            {
                                getSoundSettings(context, (config.soundTarget == "all") ? "" : config.soundTarget);
                                break;
                            }
                            case "getSpeakerSettings":
                            {
                                getSpeakerSettings(context, (config.speakerTarget == "all") ? "" : config.speakerTarget);
                                break;
                            }
                            case "getPlaybackSettings":
                            {
                                getPlaybackModeSettings(context, (config.modeTarget == "all") ? "" : config.modeTarget);
                                break;
                            }
                        }
                    }
                }
                catch (e)
                {
                    done(e.message);
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

        function validateConfiguration()
        {
            if ((config.actionType == "control")
                && (((config.action == "setSoundSettings") && (config.soundSettings.length == 0))
                    || ((config.action == "setSpeakerSettings") && (config.speakerSettings.length == 0))
                    || ((config.action == "setPlaybackSettings") && (config.modeSettings.length == 0))))
            {
                node.error(RED._("control.error.invalidSettings"));
                return false;
            }

            if (config.actionType == "api")
            {
                if (!config.api)
                {
                    node.error(RED._("control.error.invalidAPI", {api: RED._("control.error.empty")}));
                    return false;
                }

                if (config.apiType == "str")
                {
                    node.callAPI = Nunjucks.compile(config.api);
                }
                else
                {
                    node.callAPI = config.api;
                }

                if (config.paramsType == "json")
                {
                    try
                    {
                        node.callParams = JSON.parse(config.params);
                    }
                    catch (e)
                    {
                        node.error(RED._("control.error.invalidParams"));
                        return false;
                    }

                    if (typeof node.callParams != "object")
                    {
                        node.error(RED._("control.error.invalidParams"));
                        return false;
                    }
                }
                else if (config.paramsType == "jsonata")
                {
                    try
                    {
                        node.callParams = RED.util.prepareJSONataExpression(config.params, node);
                    }
                    catch (e)
                    {
                        node.error(
                                RED._("@jens_rossbach/node-red-sony-audio/sonyaudio-device:common.error.invalidExpression",
                                {error: e.code + ": " + e.message + "  [POS: " + e.position + ", TOK: '" + e.token + ", VAL: '" + e.value + "']"}));
                        return false;
                    }
                }
                else if ((config.paramsType == "env") || (config.paramsType == "msg") || (config.paramsType == "global") || (config.paramsType == "flow"))
                {
                    if (!config.params)
                    {
                        node.error(RED._("control.error.invalidParams"));
                        return false;
                    }

                    node.callParams = config.params;
                }
            }

            return true;
        }

        async function createAPICall(context)
        {
            let apiCall = null;

            if (config.actionType == "api")
            {
                let api = null;

                if (config.apiType == "str")
                {
                    try
                    {
                        api = node.callAPI.render(context.msg);
                    }
                    catch (e)
                    {
                        throw new Error(RED._("@jens_rossbach/node-red-sony-audio/sonyaudio-device:common.error.invalidTemplate", {error: e.message}));
                    }
                }
                else if (config.apiType == "env")
                {
                    api = RED.util.evaluateNodeProperty(node.callAPI, "env", node, context.msg);
                }
                else if (config.apiType == "msg")
                {
                    try
                    {
                        api = RED.util.getMessageProperty(context.msg, node.callAPI);
                    }
                    catch (e)
                    {
                        throw new Error(RED._("control.error.invalidAPI", {api: "msg." + node.callAPI}));
                    }

                    if (!api)
                    {
                        throw new Error(RED._("control.error.invalidAPI", {api: "msg." + node.callAPI}));
                    }
                }
                else if ((config.apiType == "global") || (config.apiType == "flow"))
                {
                    let ctx = RED.util.parseContextStore(node.callAPI);
                    api = node.context()[config.apiType].get(ctx.key, ctx.store);

                    if (!api)
                    {
                        throw new Error(RED._("control.error.invalidAPI", {api: config.apiType + "." + node.callAPI}));
                    }
                }

                const matches = api.match(/^([a-zA-Z]+)\.([a-zA-Z]+)@(\d+\.\d+)$/);
                if (!matches)
                {
                    throw new Error(RED._("control.error.invalidAPI", {api: api}));
                }
                else
                {
                    apiCall = {service: matches[1], method: matches[2], version: matches[3]};

                    if (config.paramsType == "json")
                    {
                        apiCall.params = node.callParams;
                    }
                    else if (config.paramsType == "jsonata")
                    {
                        let value = null;

                        try
                        {
                            value = await Utils.evaluateJSONataExpression(RED, node.callParams, context.msg);
                        }
                        catch (e)
                        {
                            throw new Error(
                                        RED._("@jens_rossbach/node-red-sony-audio/sonyaudio-device:common.error.invalidExpression",
                                        {error: e.code + ": " + e.message + "  [POS: " + e.position + ", TOK: '" + e.token + "']"}));
                        }

                        apiCall.params = getParameters(value);
                    }
                    else if (config.paramsType == "env")
                    {
                        apiCall.params = getParameters(RED.util.evaluateNodeProperty(node.callParams, "env", node, context.msg));
                    }
                    else if (config.paramsType == "msg")
                    {
                        let value = null;

                        try
                        {
                            value = RED.util.getMessageProperty(context.msg, node.callParams);
                        }
                        catch (e)
                        {
                            throw new Error(RED._("control.error.invalidParams"));
                        }

                        apiCall.params = getParameters(value);
                    }
                    else if ((config.paramsType == "global") || (config.paramsType == "flow"))
                    {
                        let ctx = RED.util.parseContextStore(node.callParams);
                        apiCall.params = getParameters(node.context()[config.paramsType].get(ctx.key, ctx.store));
                    }
                }
            }

            return apiCall;
        }

        function getParameters(input)
        {
            let value = null;

            if (typeof input == "object")
            {
                value = input;
            }
            else if (typeof input == "string")
            {
                try
                {
                    value = JSON.parse(input);
                }
                catch (e)
                {
                    throw new Error(RED._("control.error.invalidParams"));
                }

                if (typeof value != "object")
                {
                    throw new Error(RED._("control.error.invalidParams"));
                }
            }
            else
            {
                throw new Error(RED._("control.error.invalidParams"));
            }

            return value;
        }

        function setPowerStatus(context, status)
        {
            sendRequest(
                context,
                "system",
                "setPowerStatus",
                "1.1",
                {status: status});
        }

        function setAudioVolume(context, volume, relative = false, zone = 0)
        {
            sendRequest(
                context,
                "audio",
                "setAudioVolume",
                "1.1", {
                    output: (zone > 0)
                        ? "extOutput:zone?zone=" + zone
                        : "",
                    volume: (relative && (volume > 0))
                        ? "+" + volume
                        : volume.toString()});
        }

        function setAudioMute(context, mute, zone = 0)
        {
            sendRequest(
                context,
                "audio",
                "setAudioMute",
                "1.1", {
                    output: (zone > 0)
                        ? "extOutput:zone?zone=" + zone
                        : "",
                    mute: mute});
        }

        function setSoundSettings(context, params)
        {
            sendRequest(
                context,
                "audio",
                "setSoundSettings",
                "1.1",
                {settings: params});
        }

        function setSpeakerSettings(context, params)
        {
            sendRequest(
                context,
                "audio",
                "setSpeakerSettings",
                "1.0",
                {settings: params});
        }

        function setPlaybackModeSettings(context, params)
        {
            sendRequest(
                context,
                "avContent",
                "setPlaybackModeSettings",
                "1.0",
                {settings: params});
        }

        function setPlayContent(context, source, port = 0, preset = -1, zone = 0)
        {
            let uri = source;
            if (((source == "extInput:hdmi")
                || (source == "extInput:line"))
                && (port > 0))
            {
                uri += "?port=" + port;
            }
            else if ((source == "radio:fm")
                        && (preset >= 0))
            {
                uri += "?contentId=" + preset;
            }

            sendRequest(
                context,
                "avContent",
                "setPlayContent",
                "1.2", {
                    output: (zone > 0)
                        ? "extOutput:zone?zone=" + zone
                        : "",
                    uri: uri});
        }

        function stopPlayingContent(context, zone = 0)
        {
            sendRequest(
                context,
                "avContent",
                "stopPlayingContent",
                "1.1", {
                    output: (zone > 0)
                        ? "extOutput:zone?zone=" + zone
                        : ""});
        }

        function pausePlayingContent(context, zone = 0)
        {
            sendRequest(
                context,
                "avContent",
                "pausePlayingContent",
                "1.1", {
                    output: (zone > 0)
                        ? "extOutput:zone?zone=" + zone
                        : ""});
        }

        function setPlayPreviousContent(context, zone = 0)
        {
            sendRequest(
                context,
                "avContent",
                "setPlayPreviousContent",
                "1.0", {
                    output: (zone > 0)
                        ? "extOutput:zone?zone=" + zone
                        : ""});
        }

        function setPlayNextContent(context, zone = 0)
        {
            sendRequest(
                context,
                "avContent",
                "setPlayNextContent",
                "1.0", {
                    output: (zone > 0)
                        ? "extOutput:zone?zone=" + zone
                        : ""});
        }

        function scanPlayingContent(context, fwd, zone = 0)
        {
            sendRequest(
                context,
                "avContent",
                "scanPlayingContent",
                "1.0", {
                    direction: fwd
                        ? "fwd"
                        : "bwd",
                    output: (zone > 0)
                        ? "extOutput:zone?zone=" + zone
                        : ""});
        }

        function getPowerStatus(context)
        {
            sendRequest(
                context,
                "system",
                "getPowerStatus",
                "1.1",
                null);
        }

        function getSWUpdateInfo(context, network)
        {
            sendRequest(
                context,
                "system",
                "getSWUpdateInfo",
                "1.0", {
                    network: network
                        ? "true"
                        : "false"});
        }

        function getPlayingContentInfo(context, zone = 0)
        {
            sendRequest(
                context,
                "avContent",
                "getPlayingContentInfo",
                "1.2", {
                    output: (zone > 0)
                        ? "extOutput:zone?zone=" + zone
                        : ""});
        }

        function getVolumeInfo(context, zone = 0)
        {
            sendRequest(
                context,
                "audio",
                "getVolumeInformation",
                "1.1", {
                    output: (zone > 0)
                        ? "extOutput:zone?zone=" + zone
                        : ""});
        }

        function getSoundSettings(context, target)
        {
            sendRequest(
                context,
                "audio",
                "getSoundSettings",
                "1.1",
                {target: target});
        }

        function getSpeakerSettings(context, target)
        {
            sendRequest(
                context,
                "audio",
                "getSpeakerSettings",
                "1.0",
                {target: target});
        }

        function getPlaybackModeSettings(context, target)
        {
            sendRequest(
                context,
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

        function sendRequest(context, service, method, version, params)
        {
            setStatus(STATUS_SENDING);

            node.device.sendRequest(service, method, version, params)
            .then(data =>
            {
                Utils.prepareOutput(RED, node, node.output, config.msgPassThrough ? context.msg : null, data, config.sendIfPayload)
                .then(out =>
                {
                    if (out)
                    {
                        context.send(out);
                    }

                    setStatus(STATUS_SUCCESS, STATUS_TEMP_DURATION);
                    context.done();
                });
            })
            .catch(error =>
            {
                setStatus(STATUS_ERROR, STATUS_TEMP_DURATION);
                context.done(error);
            });
        }
    }

    RED.nodes.registerType("sonyaudio-control", SonyAudioControlNode);
};
