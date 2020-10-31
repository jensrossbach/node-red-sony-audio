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

function define(name, value)
{
    Object.defineProperty(exports, name,
    {
        value: value,
        enumerable: true
    });
}

define("EVENT_SYSTEM_NOTIFY_POWER_STATUS",  0x01);
define("EVENT_SYSTEM_NOTIFY_STORAGE_STATUS",  0x02);
define("EVENT_SYSTEM_NOTIFY_SETTINGS_UPDATE", 0x04);
define("EVENT_SYSTEM_NOTIFY_SWUPDATE_INFO",   0x08);

define("EVENT_AUDIO_NOTIFY_VOLUME_INFO", 0x01);

define("EVENT_AVCONTENT_NOTIFY_EXT_TERM_STATUS",      0x01);
define("EVENT_AVCONTENT_NOTIFY_AVAIL_PB_FUNCTION",    0x02);
define("EVENT_AVCONTENT_NOTIFY_PLAYING_CONTENT_INFO", 0x04);
