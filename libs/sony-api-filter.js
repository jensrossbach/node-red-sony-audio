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

module.exports =
{
    filterData: function(data, filter)
    {
        const URI_REGEX    = /^([a-zA-Z0-9\-]+)\:([a-zA-Z0-9\-]+)(?:\?port\=([0-9]))?$/;
        const OUTPUT_REGEX = /^([a-zA-Z0-9\-]+)\:([a-zA-Z0-9\-]+)(?:\?zone\=([0-9]))?$/;

        var outputMsg = null;

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

                if (uri !== null)
                {
                    let matches = uri.match(URI_REGEX);
                    if (matches !== null)
                    {
                        let source = {scheme: matches[1], resource: matches[2]};
                        if (matches[3] !== null)
                        {
                            source.port = Number(matches[3]);
                        }

                        outputMsg = {payload: source};
                    }
                }

                break;
            }
            case "absoluteVolume":
            {
                let payload = null;

                if (data.method == "getVolumeInformation")
                {
                    if (data.payload.length > 0)
                    {
                        payload = data.payload[0];
                    }
                }
                else if (data.method == "notifyVolumeInformation")
                {
                    payload = data.payload;
                }

                if ((payload !== null) && (payload.volume >= 0))
                {
                    let zone = 0;
                    let matches = payload.output.match(OUTPUT_REGEX);

                    if ((matches !== null) && (matches[3] !== null))
                    {
                        zone = Number(matches[3]);
                    }

                    if (zone > 0)
                    {
                        outputMsg = {payload: {volume: payload.volume, zone: zone}};
                    }
                    else
                    {
                        outputMsg = {payload: payload.volume};
                    }
                }

                break;
            }
            case "relativeVolume":
            {
                let payload = null;

                if (data.method == "getVolumeInformation")
                {
                    if (data.payload.length > 0)
                    {
                        payload = data.payload[0];
                    }
                }
                else if (data.method == "notifyVolumeInformation")
                {
                    payload = data.payload;
                }

                if ((payload !== null) && (payload.step != 0))
                {
                    let zone = 0;
                    let matches = payload.output.match(OUTPUT_REGEX);

                    if ((matches !== null) && (matches[3] !== null))
                    {
                        zone = Number(matches[3]);
                    }

                    if (zone > 0)
                    {
                        outputMsg = {payload: {volume: payload.step, zone: zone}};
                    }
                    else
                    {
                        outputMsg = {payload: payload.step};
                    }
                }

                break;
            }
            case "muted":
            {
                let payload = null;

                if (data.method == "getVolumeInformation")
                {
                    if (data.payload.length > 0)
                    {
                        payload = data.payload[0];
                    }
                }
                else if (data.method == "notifyVolumeInformation")
                {
                    payload = data.payload;
                }

                if ((payload !== null) && (payload.mute !== "toggle"))
                {
                    let zone = 0;
                    let matches = payload.output.match(OUTPUT_REGEX);

                    if ((matches !== null) && (matches[3] !== null))
                    {
                        zone = Number(matches[3]);
                    }

                    if (zone > 0)
                    {
                        outputMsg = {payload: {muted: (payload.mute === "on"), zone: zone}};
                    }
                    else
                    {
                        outputMsg = {payload: (payload.mute === "on")};
                    }
                }

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
        }

        return outputMsg;
    }
}