# Changelog
All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.4] - 2020-11-01
### Changed
- Internal code optimizations.
- Optimizations for help pages.

### Fixed
- Allow chaining of nodes via response outputs.
  - New option _Enable Low-Level Override_ can be used to prevent interpretation of low-level information in subsequent nodes.
  - Fixed wrong interpretation of null payload as object

## [1.6.3] - 2020-09-05
### Changed
- Internal code optimizations.

## [1.6.2] - 2020-08-16
### Changed
- Internal code optimizations.

### Fixed
- Corrected and improved node documentation.
- Fixed wrong label assignment in device node configuration page.

## [1.6.1] - 2020-06-06
### Changed
- Renamed commands getPlaybackModes and setPlaybackModes to getPlaybackSettings and setPlaybackSettings respectively (backward compatible).

### Fixed
- Fixed setSource command for line input source (added possibility to specify port).
- Fixed wrong links in documentation.
- Fixed and optimized configuration page layout.
- Optimized texts and translations.

## [1.6.0] - 2020-05-23
### Added
- Added support for localization of UI and documentation texts.
- Added German localization.

### Changed
- Moved detailed documentation from [README.md](README.md) to [repository wiki](https://github.com/jensrossbach/node-red-contrib-sony-audio/wiki).

## [1.5.3] - 2020-05-21
### Fixed
- Fixed crash when connection to notification API service failed.

## [1.5.2] - 2020-05-20
### Fixed
- Fixed showing/hiding filters list in configuration page depending on output port selection.

## [1.5.1] - 2020-04-20
### Fixed
- Fixed ESLint issues and other minor bugs.

## [1.5.0] - 2020-04-19
### Added
- Device discovery now also provides model name of each found device.
- Added the possibility to provide the volume for setVolume command as payload of type 'number'.

### Changed
- Direct access to Sony audio control web API now abstracted by device node.
- Manage connections to Sony audio notification API centrally from device node instead of each receiver node.

### Fixed
- Fixed error logs during device discovery for non-conform devices using Sony's SSDP search scheme.

## [1.4.0] - 2019-11-17
### Added
- Device discovery to search for Sony audio devices in the network
- Support for multi-zone volume information

### Changed
- Internal code optimizations

## [1.3.0] - 2019-10-19
### Added
- Auto filter for controller node automatically selecting an appropriate filter depending on the command and customizable through command suffixes.
- Auto filter for receiver node automatically selecting an appropriate filter depending on the notification.
- New command for controller node to retrieve software update information.

## [1.2.0] - 2019-10-13
### Added
- Support for MQTT like topics. If enabled, `msg.topic` is parsed for either command or low-level request service/method/version.

## [1.1.0] - 2019-10-03
### Changed
- Migrated controller node to Node-RED 1.0 API (remaining backwards compatible to Node-RED 0.x).
- Removed error output from controller node to be more compliant to Node-RED guidelines (all possible errors to be handled by catch nodes).
- Receiver node now throws errors instead of logging warnings to allow handling errors via a catch node.

### Fixed
- No error status shown when invalid command or volume provided via input message to command node.

## [1.0.0] - 2019-07-27
Initial version and first published release.