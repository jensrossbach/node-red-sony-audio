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

module.exports = function(RED)
{
    const DISCOVERY_SEARCH_TARGET = "urn:schemas-sony-com:service:ScalarWebAPI:1";
    const URI_REGEX               = /^http\:\/\/([a-zA-Z0-9\.\-]+)\:([0-9]+)\/sony$/;

    const httpRequest = require("request-promise");
    const xmlConverter = require("xml-js");

    const SSDPClient = require("node-ssdp").Client;
    var ssdpClient = new SSDPClient({explicitSocketBind: true});

    var deviceList = [];

    RED.httpAdmin.get("/sony_audio_devices", RED.auth.needsPermission("sony-audio.read"), function(req, res)
    {
        if (req.query.type === "cached")
        {
            // return cached values
            RED.log.debug("Returning cached Sony audio devices.");
            res.json(deviceList);
        }
        else
        {
            RED.log.debug("Searching for Sony audio devices...");

            deviceList = [];
            ssdpClient.search(DISCOVERY_SEARCH_TARGET);

            setTimeout(() =>
            {
                ssdpClient.stop();
                res.json(deviceList);
            }, 5000);
        }
    });

    ssdpClient.on("response", function(headers, code, rinfo)
    {
        if (code == 200)
        {
            httpRequest({method: "get", uri: headers.LOCATION}).then(response =>
            {
                let desc = xmlConverter.xml2js(response, {compact: true});
                let devName = desc.root.device.friendlyName._text;
                let devURL = desc.root.device["av:X_ScalarWebAPI_DeviceInfo"]["av:X_ScalarWebAPI_BaseURL"]._text;

                let matches = devURL.match(URI_REGEX);
                if (matches !== null)
                {
                    RED.log.debug("Found Sony audio device: " + devName + "@" + matches[1] + ":" + matches[2]);
                    deviceList.push({name: devName, address: {host: matches[1], port: matches[2]}});
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

    function SonyAudioDeviceNode(config)
    {
        RED.nodes.createNode(this, config);

        this.name = config.name;
        this.host = config.host;
        this.port = config.port;
    }

    RED.nodes.registerType("sony-audio-device", SonyAudioDeviceNode);
}