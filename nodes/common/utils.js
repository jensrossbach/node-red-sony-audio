/*
 * Copyright (c) 2021 Jens-Uwe Rossbach
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

module.exports =
{
    filterData: function(RED, node, data, filter, inputMsg)
    {
        const URI_REGEX    = /^([a-zA-Z0-9-]+):([a-zA-Z0-9-]+)(?:\?(port|contentId)=([0-9]))?$/;
        const OUTPUT_REGEX = /^[a-zA-Z0-9-]+:[a-zA-Z0-9-]+(?:\?zone=([0-9]))?$/;

        function filterVolumeInfo(data, getFilteredData)
        {
            let ret = null;
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

            if (payload != null)
            {
                let out = [];
                for (let i = 0; i < payload.length; ++i)
                {
                    let zone = 0;
                    if (typeof payload[i].output == "string")
                    {
                        let matches = payload[i].output.match(OUTPUT_REGEX);

                        if ((matches != null) && (matches[1] != null))
                        {
                            zone = Number(matches[1]);
                        }
                    }

                    let flt = getFilteredData(payload[i], zone);
                    if (flt != null) { out.push(flt); }
                }

                if (out.length == 1)
                {
                    ret = {payload: out[0]};
                }
                else if (out.length > 1)
                {
                    ret = {payload: out};
                }
            }

            return ret;
        }

        let outputMsg = null;

        switch (filter.name)
        {
            case "powered":
            {
                if (((data.method == "getPowerStatus") ||
                    (data.method == "notifyPowerStatus")))
                {
                    let isPowered = (data.payload.status === "active");

                    if (!filter.explicit ||
                        (filter.explicit && isPowered))
                    {
                        outputMsg = {payload: isPowered};
                    }
                }

                break;
            }
            case "standby":
            {
                if (((data.method == "getPowerStatus") ||
                    (data.method == "notifyPowerStatus")))
                {
                    let isStandby = (data.payload.status === "standby");

                    if (!filter.explicit ||
                        (filter.explicit && isStandby))
                    {
                        outputMsg = {payload: isStandby};
                    }
                }

                break;
            }
            case "swupdate":
            {
                if (((data.method == "getSWUpdateInfo") ||
                    (data.method == "notifySWUpdateInfo")))
                {
                    let isUpdAvail = (data.payload.isUpdatable === "true");

                    if (!filter.explicit ||
                        (filter.explicit && isUpdAvail))
                    {
                        outputMsg = {payload: isUpdAvail};
                    }
                }

                break;
            }
            case "source":
            {
                let uri = null;

                if (data.method == "getPlayingContentInfo")
                {
                    if (data.payload.length > 0)
                    {
                        uri = data.payload[0].uri;
                    }
                }
                else if (data.method == "notifyPlayingContentInfo")
                {
                    uri = data.payload.uri;
                }

                if (uri)
                {
                    let matches = uri.match(URI_REGEX);
                    if (matches)
                    {
                        let source = {scheme: matches[1], resource: matches[2]};

                        if (matches[4])
                        {
                            if (matches[3] === "port")
                            {
                                source.port = parseInt(matches[4]);
                            }
                            else if (matches[3] === "contentId")
                            {
                                source.preset = parseInt(matches[4]);
                            }
                        }

                        outputMsg = {payload: source};
                    }
                }

                break;
            }
            case "absoluteVolume":
            {
                outputMsg = filterVolumeInfo(data, (payload, zone) =>
                {
                    let ret = null;

                    if (payload.volume >= 0)
                    {
                        ret = (zone > 0) ? {volume: payload.volume, zone: zone} : payload.volume;
                    }

                    return ret;
                });

                break;
            }
            case "relativeVolume":
            {
                outputMsg = filterVolumeInfo(data, (payload, zone) =>
                {
                    let ret = null;

                    if (payload.step != 0)
                    {
                        ret = (zone > 0) ? {volume: payload.step, zone: zone} : payload.step;
                    }

                    return ret;
                });

                break;
            }
            case "muted":
            {
                outputMsg = filterVolumeInfo(data, (payload, zone) =>
                {
                    let ret = null;

                    if (payload.mute !== "toggle")
                    {
                        ret = (zone > 0) ? {muted: (payload.mute === "on"), zone: zone} : (payload.mute === "on");
                    }

                    return ret;
                });

                break;
            }
            case "soundSetting":
            {
                if (data.method == "getSoundSettings")
                {
                    let out = [];
                    for (let j=0; j<data.payload.length; ++j)
                    {
                        let payload = data.payload[j];

                        if (("target" in payload) &&
                            ("currentValue" in payload))
                        {
                            switch (payload.target)
                            {
                                case "soundField":
                                case "voice":
                                {
                                    out.push(payload.currentValue);
                                    break;
                                }
                                case "clearAudio":
                                case "nightMode":
                                case "footballMode":
                                {
                                    out.push(payload.currentValue === "on");
                                    break;
                                }
                            }
                        }
                    }

                    if (out.length == 1)
                    {
                        outputMsg = {payload: out[0]};
                    }
                    else if (out.length > 1)
                    {
                        outputMsg = {payload: out};
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

                        if (("target" in payload) &&
                            ("currentValue" in payload))
                        {
                            if (payload.type === "doubleNumberTarget")
                            {
                                out[payload.target] = parseFloat(payload.currentValue);
                            }
                            else
                            {
                                out[payload.target] = payload.currentValue;
                            }
                        }
                    }

                    let keys = Object.keys(out);
                    if (keys.length == 1)
                    {
                        outputMsg = {payload: out[keys[0]]};
                    }
                    else if (keys.length > 1)
                    {
                        outputMsg = {payload: out};
                    }
                }

                break;
            }
            case "playbackMode":
            {
                if (data.method == "getPlaybackModeSettings")
                {
                    let out = [];
                    for (let j=0; j<data.payload.length; ++j)
                    {
                        let payload = data.payload[j];

                        if (("target" in payload) &&
                            ("currentValue" in payload))
                        {
                            out.push(payload.currentValue);
                        }
                    }

                    if (out.length == 1)
                    {
                        outputMsg = {payload: out[0]};
                    }
                    else if (out.length > 1)
                    {
                        outputMsg = {payload: out};
                    }
                }

                break;
            }
            case "custom":
            {
                let expression = null;
                switch (filter.custom.type)
                {
                    case "global":
                    case "flow":
                    {
                        let ctx = RED.util.parseContextStore(filter.custom.value);
                        expression = node.context()[filter.custom.type].get(ctx.key, ctx.store);
                        break;
                    }
                    case "msg":
                    {
                        expression = RED.util.getMessageProperty(inputMsg, filter.custom.value);
                        break;
                    }
                    case "jsonata":
                    {
                        expression = filter.custom.value;
                    }
                }

                if ((typeof expression == "string") && (expression.length > 0))
                {
                    let jsonataExpr = RED.util.prepareJSONataExpression(expression, node);
                    jsonataExpr.assign("host", node.device.host);

                    let payload = RED.util.evaluateJSONataExpression(jsonataExpr, data);
                    if (payload != null)
                    {
                        outputMsg = {payload: payload};
                    }
                }

                break;
            }
        }

        return outputMsg;
    }
};
