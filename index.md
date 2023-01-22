# Node-RED Sony Audio

<a href="https://www.npmjs.com/package/@jens_rossbach/node-red-sony-audio"><img title="npm version" src="https://badgen.net/npm/v/@jens_rossbach/node-red-sony-audio"></a>
<a href="https://www.npmjs.com/package/@jens_rossbach/node-red-sony-audio"><img title="npm downloads" src="https://badgen.net/npm/dt/@jens_rossbach/node-red-sony-audio"></a>

A collection of Node-RED nodes for querying and controlling Sony audio devices that support the Sony Audio Control API.

With these nodes you can connect to your Sony audio devices and send control commands (like powering on/off or change volume), retrieve information (like the current volume or the current value of a sound setting) or get notified of certain events (like the device being turned on/off or the volume being changed).

## History
Welcome to the 3rd generation of the Node-RED node package for Sony audio devices. This is version 2 of [Node-RED Sony Audio](https://github.com/jensrossbach/node-red-contrib-sony-audio) where large parts of the software have been rewritten. The nodes have been modernized, made much leaner and cleaner and at the same time provide more flexibility and new powerful functionality.

Everything started back in 2019 when I was quite new to Node-RED and realized that there were no nodes existing to control my Sony HT-XT3 soundbar. So I decided to implement my own nodes and the result was the first generation of my node package, known under the name [Node-RED Sony Audio Control](https://github.com/jensrossbach/node-red-contrib-sony-audio-control). It came with four flow nodes but it was not always clear how to utilize the nodes. Therefore I decided three months later to completely restructure the nodes and condensed them to just two flow nodes. The result was the package [Node-RED Sony Audio](https://github.com/jensrossbach/node-red-contrib-sony-audio). Now, three years later, I decided once again to make a breaking change to the nodes. As I didn't want to break people's flows and also plan to keep the second generation node package for people that don't want to migrate, I created a new repository and NPM package.

As already mentioned, the new nodes are much leaner now. To achieve this, I had to remove certain functionality of which I believe the benefit was not so high anyway and there was a lack of understandability, making the nodes too complicated. If you want to continue to use this functionality, you should stay with version 1 and not migrate to version 2 as I intentionally left out this functionality and will not port it to the new version.

As an example, it is not possible anymore to override commands and command settings from the configuration UI via input message. I decided that it does not make sense to have yet another API for providing the data for requests that needs to be learned by people. Instead, now you can create API calls according to the specification of the Sony Audio Control API via the node configuration and optionally take the data from input messages, environment variables or context variables. The possibility to use templates and JSONata expressions further supports you and gives a lot of flexibility. Of course it is still possible to use the predefined built-in commands via the configuration UI as before, in case you are not familiar with the Sony Audio Control API and don't want to deal with it.

Another example is that the flow nodes do not support multiple outputs anymore. On the other side, it is now possible to precisely define the output message and even set context variables upon receiving data from the device.

## Documentation
The detailed documentation which explains the configuration of the nodes and utilization of input and output messages including examples is available in the wiki of the GitHub repository.

**&rarr; [Documentation Wiki](https://github.com/jensrossbach/node-red-sony-audio/wiki)**

## Development
If you encountered a bug, would like to propose a new feature or simply want to share your opinion about the software, please have a look at the [contribution guide](https://github.com/jensrossbach/node-red-sony-audio/blob/master/CONTRIBUTING.md) on the GitHub repository to learn more about how to contribute to this project. If you need help or have questions, please check out the [instructions for getting support](https://github.com/jensrossbach/node-red-sony-audio/blob/master/SUPPORT.md).

To see what has changed in recent versions of the software, please have a look at the project's [change log](https://github.com/jensrossbach/node-red-sony-audio/blob/master/CHANGELOG.md).

## License
Copyright (c) 2023 Jens-Uwe Rossbach

This code is licensed under the MIT License.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Sony Legal Information
### Trademark
The trademark "SONY" and any other product names, service names or logos of SONY used, quoted and/or referenced in this Web Site are trademarks or registered trademarks of Sony Corporation or any of its affiliates.

### License Audio Control API
Copyright (c) 2023 Sony Corporation. All rights reserved.

The 'Audio Control API' is licensed to the user by Sony Video & Sound products Inc. under the license terms of the [Creative Commons Attribution-NoDerivatives 4.0 International Public License](https://creativecommons.org/licenses/by-nd/4.0/legalcode).

For more information, see the official web site of the Sony [Audio Control API](https://developer.sony.com/develop/audio-control-api).
