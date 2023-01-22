/*
 * Copyright (c) 2023 Jens-Uwe Rossbach
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


const Nunjucks = require("nunjucks");

module.exports =
{
    validateOutputProperties: function(RED, node, source, target, allowEmpty)
    {
        for (let prop of source)
        {
            if (!prop.name)
            {
                node.error(RED._("@jens_rossbach/node-red-sony-audio/sonyaudio-device:common.error.invalidPropName"));
                return false;
            }

            let out = {type: prop.type, name: prop.name, value: {type: prop.value.type}};

            if ((prop.value.type == "filtered") || (prop.value.type == "unfiltered"))
            {
                out.value.content = prop.value.content;
            }
            else if (prop.value.type == "env")
            {
                if (prop.value.content)
                {
                    out.value.content = prop.value.content;
                }
                else
                {
                    node.error(RED._("@jens_rossbach/node-red-sony-audio/sonyaudio-device:common.error.invalidEnvVar"));
                    return false;
                }
            }
            else if (prop.value.type == "str")
            {
                if (prop.value.content)
                {
                    out.value.content = Nunjucks.compile(prop.value.content);
                }
                else
                {
                    // will be set to empty string on output
                    out.value.content = null;
                }
            }
            else if (prop.value.type == "num")
            {
                if (+prop.value.content === +prop.value.content)
                {
                    out.value.content = +prop.value.content;
                }
                else
                {
                    node.error(RED._("@jens_rossbach/node-red-sony-audio/sonyaudio-device:common.error.invalidNumber"));
                    return false;
                }
            }
            else if (prop.value.type == "bool")
            {
                if (/^(true|false)$/.test(prop.value.content))
                {
                    out.value.content = (prop.value.content == "true");
                }
                else
                {
                    // should normally never happen
                    return false;
                }
            }
            else if (prop.value.type == "json")
            {
                try
                {
                    out.value.content = JSON.parse(prop.value.content);
                }
                catch (e)
                {
                    node.error(RED._("@jens_rossbach/node-red-sony-audio/sonyaudio-device:common.error.invalidJSON"));
                    return false;
                }
            }
            else if (prop.value.type == "jsonata")
            {
                try
                {
                    out.value.expression = RED.util.prepareJSONataExpression(prop.value.content, node);
                    out.value.content = prop.value.content;
                }
                catch (e)
                {
                    node.error(RED._("@jens_rossbach/node-red-sony-audio/sonyaudio-device:common.error.invalidExpression",
                                     {error: e.code + ": " + e.message + "  [POS: " + e.position + ", TOK: '" + e.token + ", VAL: '" + e.value + "']"}));
                    return false;
                }
            }
            else if (prop.value.type == "bin")
            {
                try
                {
                    out.value.content = Buffer.from(JSON.parse(prop.value.content));
                }
                catch (e)
                {
                    node.error(RED._("@jens_rossbach/node-red-sony-audio/sonyaudio-device:common.error.invalidBuffer"));
                    return false;
                }
            }

            target.push(out);
        }

        if ((target.length == 0) && !allowEmpty)
        {
            node.error(RED._("@jens_rossbach/node-red-sony-audio/sonyaudio-device:common.error.emptyOutput"));
            return false;
        }

        return true;
    },

    prepareOutput: function(RED, node, properties, msg, data, sendIfPayload)
    {
        let out = msg ? msg : {};
        let numMsgProps = 0;
        let payloadSet = false;

        for (let prop of properties)
        {
            try
            {
                if (prop.type == "msg")
                {
                    RED.util.setMessageProperty(out, prop.name, getProperty(prop), true);
                    ++numMsgProps;

                    if (prop.name == "payload")
                    {
                        payloadSet = true;
                    }
                }
                else
                {
                    let ctx = RED.util.parseContextStore(prop.name);
                    node.context()[prop.type].set(ctx.key, getProperty(prop), ctx.store);
                }
            }
            catch (e)
            {
                if (e.message == "__no_filter_match")
                {
                    node.debug("No filter match");
                }
                else if (e.message == "__no_expression_result")
                {
                    node.debug("No result from expression");
                }
                else
                {
                    node.error(e.message, msg ? msg : {});
                }
            }
        }

        if (((numMsgProps == 0) && !msg) || (sendIfPayload && !payloadSet))
        {
            out = null;
        }

        return out;

        function getProperty(prop)
        {
            let value = null;

            switch (prop.value.type)
            {
                case "filtered":
                {
                    value = filterData(prop.value.content);
                    break;
                }
                case "unfiltered":
                {
                    if (prop.value.content == "all")
                    {
                        value = data;
                    }
                    else
                    {
                        value = data[prop.value.content];
                    }

                    break;
                }
                case "str":
                {
                    if (prop.value.content)
                    {
                        try
                        {
                            value = prop.value.content.render(data);
                        }
                        catch (e)
                        {
                            throw new Error(RED._("@jens_rossbach/node-red-sony-audio/sonyaudio-device:common.error.invalidTemplate", {error: e.message}));
                        }
                    }
                    else
                    {
                        value = "";
                    }

                    break;
                }
                case "jsonata":
                {
                    try
                    {
                        value = RED.util.evaluateJSONataExpression(prop.value.expression, data);
                    }
                    catch (e)
                    {
                        throw new Error(RED._("@jens_rossbach/node-red-sony-audio/sonyaudio-device:common.error.invalidExpression",
                                              {error: e.code + ": " + e.message + "  [POS: " + e.position + ", TOK: '" + e.token + "']"}));
                    }

                    if (typeof value == "undefined")
                    {
                        throw new Error("__no_expression_result");
                    }

                    break;
                }
                case "date":
                case "env":
                {
                    value = RED.util.evaluateNodeProperty(prop.value.content, prop.value.type, node, msg);
                    break;
                }
                case "num":
                case "bool":
                case "json":
                case "bin":
                {
                    value = prop.value.content;
                    break;
                }
            }

            return value;
        }

        function filterData(filter)
        {
            const URI_REGEX    = /^([a-zA-Z0-9-]+):([a-zA-Z0-9-]+)(?:\?(port|contentId)=([0-9]))?$/;
            const OUTPUT_REGEX = /^[a-zA-Z0-9-]+:[a-zA-Z0-9-]+(?:\?zone=([0-9]))?$/;

            let value = null;
            let filterApplied = false;

            switch (filter)
            {
                case "auto":
                {
                    let autoFilter = null;

                    switch (data.method)
                    {
                        case "getPowerStatus":
                        case "notifyPowerStatus":
                        {
                            autoFilter = "powered";
                            break;
                        }
                        case "getSWUpdateInfo":
                        case "notifySWUpdateInfo":
                        {
                            autoFilter = "swupdate";
                            break;
                        }
                        case "getPlayingContentInfo":
                        case "notifyPlayingContentInfo":
                        {
                            autoFilter = "source";
                            break;
                        }
                        case "getVolumeInformation":
                        case "notifyVolumeInformation":
                        {
                            autoFilter = "absoluteVolume";
                            break;
                        }
                        case "getSoundSettings":
                        {
                            autoFilter = "soundSetting";
                            break;
                        }
                        case "getSpeakerSettings":
                        {
                            autoFilter = "speakerSetting";
                            break;
                        }
                        case "getPlaybackModeSettings":
                        {
                            autoFilter = "playbackSetting";
                            break;
                        }
                    }

                    if (autoFilter)
                    {
                        value = filterData(autoFilter);
                        filterApplied = true;
                    }

                    break;
                }
                case "powered":
                {
                    if (((data.method == "getPowerStatus") ||
                        (data.method == "notifyPowerStatus")))
                    {
                        value = (data.payload.status === "active");
                        filterApplied = true;
                    }

                    break;
                }
                case "standby":
                {
                    if (((data.method == "getPowerStatus") ||
                        (data.method == "notifyPowerStatus")))
                    {
                        value = (data.payload.status === "standby");
                        filterApplied = true;
                    }

                    break;
                }
                case "swupdate":
                {
                    if (((data.method == "getSWUpdateInfo") ||
                        (data.method == "notifySWUpdateInfo")))
                    {
                        value = s2b(data.payload.isUpdatable);
                        filterApplied = true;
                    }

                    break;
                }
                case "absoluteVolume":
                {
                    value = filterVolumeInfo((payload, zone) =>
                    {
                        let ret = null;

                        if (payload.volume >= 0)
                        {
                            ret = (zone >= 0) ? {volume: payload.volume, zone: zone} : payload.volume;
                        }

                        return ret;
                    });

                    if (value != null)
                    {
                        filterApplied = true;
                    }

                    break;
                }
                case "relativeVolume":
                {
                    value = filterVolumeInfo((payload, zone) =>
                    {
                        let ret = null;

                        if (payload.step != 0)
                        {
                            ret = (zone >= 0) ? {volume: payload.step, zone: zone} : payload.step;
                        }

                        return ret;
                    });

                    if (value != null)
                    {
                        filterApplied = true;
                    }

                    break;
                }
                case "muted":
                {
                    value = filterVolumeInfo((payload, zone) =>
                    {
                        let ret = null;

                        if (payload.mute !== "toggle")
                        {
                            ret = (zone >= 0) ? {muted: s2b(payload.mute), zone: zone} : s2b(payload.mute);
                        }

                        return ret;
                    });

                    if (value != null)
                    {
                        filterApplied = true;
                    }

                    break;
                }
                case "source":
                {
                    let source = null;

                    if (data.method == "getPlayingContentInfo")
                    {
                        if (data.payload.length > 0)
                        {
                            source = data.payload[0].source;
                        }
                    }
                    else if (data.method == "notifyPlayingContentInfo")
                    {
                        source = data.payload.source;
                    }

                    if (source)
                    {
                        let matches = source.match(URI_REGEX);
                        if (matches)
                        {
                            value = {scheme: matches[1], source: matches[2]};

                            if (matches[4])
                            {
                                if (matches[3] === "port")
                                {
                                    value.port = parseInt(matches[4]);
                                    filterApplied = true;
                                }
                                else if (matches[3] === "contentId")
                                {
                                    value.preset = parseInt(matches[4]);
                                    filterApplied = true;
                                }
                            }

                            filterApplied = true;
                        }
                    }

                    break;
                }
                case "soundSetting":
                {
                    if (data.method == "getSoundSettings")
                    {
                        let out = {};
                        for (let j=0; j<data.payload.length; ++j)
                        {
                            let payload = data.payload[j];

                            if (("target" in payload) && ("currentValue" in payload))
                            {
                                out[payload.target] = getTargetValue(payload.currentValue, payload.type);
                            }
                        }

                        let keys = Object.keys(out);
                        if (keys.length == 1)
                        {
                            value = out[keys[0]];
                            filterApplied = true;
                        }
                        else if (keys.length > 1)
                        {
                            value = out;
                            filterApplied = true;
                        }
                    }

                    break;
                }
                case "speakerSetting":
                {
                    if (data.method == "getSpeakerSettings")
                    {
                        let out = {};
                        for (let j=0; j<data.payload.length; ++j)
                        {
                            let payload = data.payload[j];

                            if (("target" in payload) && ("currentValue" in payload))
                            {
                                out[payload.target] = getTargetValue(payload.currentValue, payload.type);
                            }
                        }

                        let keys = Object.keys(out);
                        if (keys.length == 1)
                        {
                            value = out[keys[0]];
                            filterApplied = true;
                        }
                        else if (keys.length > 1)
                        {
                            value = out;
                            filterApplied = true;
                        }
                    }

                    break;
                }
                case "playbackSetting":
                {
                    if (data.method == "getPlaybackModeSettings")
                    {
                        let out = {};
                        for (let j=0; j<data.payload.length; ++j)
                        {
                            let payload = data.payload[j];

                            if (("target" in payload) && ("currentValue" in payload))
                            {
                                out[payload.target] = getTargetValue(payload.currentValue, payload.type);
                            }
                        }

                        let keys = Object.keys(out);
                        if (keys.length == 1)
                        {
                            value = out[keys[0]];
                            filterApplied = true;
                        }
                        else if (keys.length > 1)
                        {
                            value = out;
                            filterApplied = true;
                        }
                    }

                    break;
                }
            }

            if (!filterApplied)
            {
                throw new Error("__no_filter_match");
            }

            return value;

            function filterVolumeInfo(getFilteredData)
            {
                let value = null;
                let payload = null;

                if (data.method == "getVolumeInformation")
                {
                    if (data.payload.length > 0)
                    {
                        payload = data.payload;
                    }
                }
                else if (data.method == "notifyVolumeInformation")
                {
                    payload = [];
                    payload.push(data.payload);
                }

                if (payload)
                {
                    let out = [];
                    for (let i = 0; i < payload.length; ++i)
                    {
                        let zone = -1;
                        if (typeof payload[i].output == "string")
                        {
                            let matches = payload[i].output.match(OUTPUT_REGEX);

                            if (matches && matches[1])
                            {
                                zone = +matches[1];
                            }
                        }

                        let flt = getFilteredData(payload[i], zone);
                        if (flt != null)
                        {
                            out.push(flt);
                        }
                    }

                    if (out.length == 1)
                    {
                        value = out[0];
                    }
                    else if (out.length > 1)
                    {
                        value = out;
                    }
                }

                return value;
            }

            function getTargetValue(currentValue, type)
            {
                let value = null;

                if (type === "booleanTarget")
                {
                    value = s2b(currentValue);
                }
                else if (type === "integerTarget")
                {
                    value = parseInt(currentValue);
                }
                else if (type === "doubleNumberTarget")
                {
                    value = parseFloat(currentValue);
                }
                else
                {
                    value = currentValue;
                }

                return value;
            }

            function s2b(str)
            {
                return ((str === "on") || (str === "true") || (str === "yes"));
            }
        }
    }
};
