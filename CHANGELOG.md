## 📢 Update: Character Chat Selector v3.4.8

### 🐛 Bug Fixes
- Fixed the speaker override hook hijacking chat messages from modules that manage their own speaker (for example, Smartphone Widget's Messages App). Messages now pass through unchanged when they carry a `smartphone-widget` flag or a `character-chat-selector.skip` flag. Previously, if an actor was selected in the Chat Selector (e.g. auto-switched by Visual Novel Maker), a phone message would show up in the chat log under that actor instead of its intended sender.

## 📢 Update: Character Chat Selector v3.4.7

### 🐛 Bug Fixes
- Fixed chat editor crash on V14 caused by deprecated global `mergeObject` call (`ReferenceError: mergeObject is not defined`).

## 📢 Update: Character Chat Selector v3.4.6

### Changed
- Now supports Foundry VTT V13 and V14. Previous versions are no longer supported.

### 🐛 Bug Fixes
- Fixed autocomplete crash on V14 due to chat input element changes.
- Fixed 404 errors when autocomplete displayed actors without a portrait image.

## 📢 Update: Character Chat Selector v3.4.5

### 🐛 Bug Fixes

* **PF2E/SF2E Portrait Duplication:** Fixed an issue where PF2E and SF2E chat messages could display duplicate portraits by correctly replacing system portrait containers (e.g. `.portrait.token`) with the module portrait.


## 📢 Update: Character Chat Selector v3.4.4

### 🐛 Bug Fixes

* **Chat Scroll Stability:** Fixed a persistent issue in D&D 5e where the chat log failed to auto-scroll to the very bottom when new messages arrived.
* **Enhanced Optimization:** Implemented more robust rendering optimizations for the chat log to significantly improve performance and responsiveness.



### 📢 Update: Character Chat Selector v3.4.3

### 🐛 Bug Fixes

* **HP Tint Stability:** Fixed a console error (`TypeError: Cannot read properties of null`) that occurred when applying tint effects to messages without portraits. Added a safety check to `HpTintEffect` to ensure the portrait container exists before processing.
* **Settings Persistence:** Fixed an issue where the "Enable Hotkeys" setting would appear unchecked when reopening the configuration menu, even if it was enabled. The setting value is now correctly loaded and displayed.

** 🌏 Localization**

* **PT-BR Update:** Updated Portuguese (Brazil) localization. A huge thanks to Kharmans for the continuous and consistent updates!

## :loudspeaker: Update: Character Chat Selector v3.4.2

:bug: **Bug Fixes**

*   **Personal Themes Visibility:** Fixed a regression from v3.4.1 where custom portrait borders and colors were not displaying correctly on other users' screens (e.g., the GM seeing black borders instead of the player's chosen color). The CSS priority has been adjusted to ensure personal themes override system defaults correctly.
*   **Chat Border Sync:** Fixed logic to ensure the chat message border color correctly reflects the *author's* personal settings when "Allow Personal Themes" is enabled.

:hammer_and_wrench: **System Support**

*   **WFRP4e Compatibility:** Added support for **Warhammer Fantasy Roleplay 4th Edition**.
    *   Added a new setting: **"Hide WFRP4e Default Token"**. This option allows you to hide the default system token image to prevent duplicate portraits (Only visible when running the WFRP4e system).

:earth_asia: **Localization**

*   **PT-BR Update:** Updated Portuguese (Brazil) localization. A huge thanks to **Kharmans** for the continuous and consistent updates!

## :loudspeaker: Update: Character Chat Selector v3.4.1

:bug: **Bug Fixes**

* **Module Compatibility (CSS):** Fixed a major issue where the module's border styles were aggressively applying to **all** chat messages (including system rolls, Midi-QOL cards, etc.). The styles are now strictly isolated to messages handled by this module via a specific class (`.ccs-custom-border`).
* **Chat Bar Duplication:** Fixed a bug where saving settings triggered a full chat log refresh, causing other modules to duplicate their buttons in the chat control bar. The settings menu now updates the UI dynamically without forcing a full re-render.
* **Code Correction:** Fixed a function reference error (`updateSelector` is not a function) that occurred when toggling the "Show Chat Selector" setting.

:earth_asia: **Localization**

* **Missing Translation Keys:** Added missing language keys for the new settings window (Tabs, Section Headers, Live Preview text).
*  **PT-BR Update:** Updated Portuguese (Brazil) localization, thanks to **Kharmans**!
