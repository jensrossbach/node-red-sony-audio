# Changelog
All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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