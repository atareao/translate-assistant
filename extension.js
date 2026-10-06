/*
 * translate-assistant@atareao.es
 *
 * Copyright (c) 2022 Lorenzo Carbonell Cerezo <a.k.a. atareao>
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to
 * deal in the Software without restriction, including without limitation the
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
 * sell copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Soup from 'gi://Soup?version=3.0';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {lookupApiKey, migrateApiKey} from './secret.js';

const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;

const SHELL_KEYBINDINGS_SCHEMA = "org.gnome.shell.keybindings";
const SHORTCUT_SETTING_KEY = "keybinding-translate-clipboard";
// Source language code meaning "let DeepL detect it".
const AUTO_LANG = "AUTO";

/* GNOME 45's ScrollView is an St.Bin whose set_child() skips wiring up
 * the scroll adjustments; only add_actor() does that there. GNOME 46
 * has its own set_child() and no add_actor(). */
function setScrollChild(scroll, child){
    if(scroll instanceof St.Bin)
        scroll.add_actor(child);
    else
        scroll.set_child(child);
}


const TranslateAssistant = GObject.registerClass(
    class TranslateAssistant extends PanelMenu.Button{
        _init(extension){
            super._init(0.0);

            this._extension = extension;

            this._settingsChangedId = null;
            this._clipboardTimeoutId = null;
            this._selectionOwnerChangedId = null;

            this._settings = extension.getSettings();

            /* Icon indicator */
            let box = new St.BoxLayout();
            this.icon = new St.Icon({style_class: 'system-status-icon'});
            box.add_child(this.icon);
            this.add_child(box);

            this.autoPasteSwitch = new PopupMenu.PopupSwitchMenuItem(
                _('Auto Paste'), this._getValue("auto-paste"), {});
            this.menu.addMenuItem(this.autoPasteSwitch)
            this.autoTranslateSwitch = new PopupMenu.PopupSwitchMenuItem(
                _('Auto Translate'), this._getValue("auto-translate"), {});
            this.menu.addMenuItem(this.autoTranslateSwitch)
            this.autoCopySwitch = new PopupMenu.PopupSwitchMenuItem(
                _('Auto Copy'), this._getValue("auto-copy"), {});
            this.menu.addMenuItem(this.autoCopySwitch)
            this._source_lang = this._get_country_code(this._getValue('source-lang'));
            this._target_lang = this._get_country_code(this._getValue('target-lang'));
            /* Separator */
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            this.menu.addMenuItem(this._menuInput());
            this.menu.addMenuItem(this._menuIcons());
            this.menu.addMenuItem(this._menuOutput());

            /* Separator */
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            /* Setings */
            this.settingsMenuItem = new PopupMenu.PopupMenuItem(_("Settings"));
            this.settingsMenuItem.connect('activate', () => {
                this._extension.openPreferences();
            });
            this.menu.addMenuItem(this.settingsMenuItem);
            /* Init */
            this._set_icon_indicator();
            this._settingsChanged();
            this._settingsChangedId = this._settings.connect('changed', ()=>{
                this._settingsChanged();
            });

            this._setupListener();
        }

        _setupListener(){
            const selection = global.display.get_selection();
            this._setupSelectionTracking(selection);
        }

        _setupSelectionTracking (selection) {
            this.selection = selection;
            this._selectionOwnerChangedId = selection.connect('owner-changed', (selection, selectionType, selectionSource) => {
                this._onSelectionChange(selection, selectionType, selectionSource);
            });
        }

        _translateIfAutoPaste(){
            if(this.autoPasteSwitch.state === true){ 
                St.Clipboard.get_default().get_text(CLIPBOARD_TYPE,(_, fromText) => {
                    if(fromText && fromText !== ""){
                        this.inputEntry.get_clutter_text().set_text(fromText);
                        if(this.autoTranslateSwitch.state === true){
                            this._translateText(true, fromText, (toText) => {
                                this.outputEntry.get_clutter_text().set_text(toText);
                                if(this.autoCopySwitch.state === true){
                                    this._copyToClipboard(toText);
                                }
                            });
                        }
                    }
                });
            }
        }

        _onSelectionChange(_a, selectionType, _b){
            if (selectionType === Meta.SelectionType.SELECTION_CLIPBOARD) {
                this._translateIfAutoPaste();
            }
        }

        _disconnectSelectionListener () {
            if (!this._selectionOwnerChangedId)
                return;

            this.selection.disconnect(this._selectionOwnerChangedId);
            this._selectionOwnerChangedId = null;
        }
        _disconnectSettings () {
            if (!this._settingsChangedId)
                return;

            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }

        _loadPreferences(){
            this._source_lang = this._get_country_code(this._getValue('source-lang'));
            this._target_lang = this._get_country_code(this._getValue('target-lang'));
            this._split_sentences = this._getValue('split-sentences');
            this._preserve_formatting = this._getValue('preserve-formatting');
            this._formality = this._getValue('formality');
            this._url = this._getValue('url');
            this._keybinding_translate_clipboard = this._getValue(SHORTCUT_SETTING_KEY);
                        this._notifications = this._getValue('notifications');
            this._darktheme = this._getValue('darktheme');

            this._set_icon_indicator();
            this._unbindShortcut();
            this._bindShortcut();
        }

        _bindShortcut(){
            Main.wm.addKeybinding(
                SHORTCUT_SETTING_KEY,
                this._settings,
                Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                () => {
                    St.Clipboard.get_default().get_text(CLIPBOARD_TYPE,(_, fromText) => {
                        this.inputEntry.get_clutter_text().set_text(fromText);
                        this._translateText(true, fromText, (toText) => {
                            this.outputEntry.get_clutter_text().set_text(toText);
                            if(this.autoCopySwitch.state === true){
                                this._copyToClipboard(toText);
                            }
                        });
                    });
                }
            );
        }

        _unbindShortcut(){
            Main.wm.removeKeybinding(SHORTCUT_SETTING_KEY);
        }

        _translateText(fromOrTo, fromText, callback){
            if(!fromText || fromText === "")
                return;
            // Never send the API key over plain HTTP or to a non-URL.
            // Keep the checked URL: prefs may change this._url while the
            // keyring lookup is pending.
            const url = this._url;
            if(!url.toLowerCase().startsWith('https://')){
                Main.notify("Translate Assistant", _("DeepL URL must start with https://"));
                return;
            }
            lookupApiKey().then((apikey) => {
                if(this._destroyed)
                    return;
                if(!apikey){
                    Main.notify("Translate Assistant", _("Set API Key of DeepL"));
                    return;
                }
                this._sendTranslation(apikey, url, fromOrTo, fromText, callback);
            }).catch((e) => {
                Main.notify("Translate Assistant", `Error: ${e.message}`);
            });
        }

        _sendTranslation(apikey, url, fromOrTo, fromText, callback){
            if(apikey){
                let split_sentences = this._split_sentences?"1":"0";
                let preserve_formatting = this._preserve_formatting?"1":"0";
                let sourceLang = fromOrTo === true?this._source_lang:this._target_lang;
                let targetLang = fromOrTo === true?this._target_lang:this._source_lang;
                if(targetLang === AUTO_LANG){
                    targetLang = this._detected_lang;
                    if(!targetLang){
                        Main.notify("Translate Assistant",
                            _("Translate once so the source language can be detected"));
                        return;
                    }
                }
                let params = {
                    text: fromText,
                    target_lang: targetLang,
                    split_sentences: split_sentences,
                    preserve_formatting: preserve_formatting,
                    formality: this._formality,
                };
                // Omitting source_lang makes DeepL detect it. Source codes
                // carry no regional variant (EN-US -> EN).
                if(sourceLang !== AUTO_LANG){
                    params.source_lang = sourceLang.split('-')[0];
                }
                let message = Soup.Message.new_from_encoded_form(
                    'POST',
                    url,
                    Soup.form_encode_hash(params)
                );
                message.get_request_headers().append(
                    'Authorization', `DeepL-Auth-Key ${apikey}`);
                let session = new Soup.Session();
                session.send_and_read_async(
                    message,
                    GLib.PRIORITY_DEFAULT,
                    null,
                    (session, result) => {
                        if(message.get_status() === Soup.Status.OK) {
                            try {
                                if(result){
                                    let bytes = session.send_and_read_finish(result);
                                    let decoder = new TextDecoder("utf-8");
                                    let response = decoder.decode(bytes.get_data());
                                    let json = JSON.parse(response);
                                    let translations = json.translations;
                                    let toText = null;
                                    if (translations.length > 0){
                                        toText = translations[0].text;
                                        if(fromOrTo === true){
                                            this._detected_lang =
                                                translations[0].detected_source_language;
                                        }
                                    }else{
                                        toText = "";
                                    }
                                    if(this._notifications){
                                        Main.notify("Translate Assistant", _("Translated"));
                                    }
                                    callback(toText);
                                }
                            } catch(e) {
                                Main.notify("Translate Assistant", `Error: ${e}`);
                            }
                        }else{
                            if(message.status_code == 403){
                                Main.notify("Translate Assistant", _("Set API Key of DeepL"));
                            }else{
                                const code = message.status_code;
                                Main.notify("Translate Assistant", `Error: ${code}`);
                            }
                        }
                    }
                );
            }
        }

        _get_country_code(description){
            const regex = /^[^(]*\(([^)]*)\)$/gm;
            let m = regex.exec(description);
            if(m.length > 1){
                return m[1];
            }
            return null;
        }

        _menuIconsOut(){
            let boxOut = new St.BoxLayout({
                vertical: false,
                x_expand: true,
                trackHover: false,
                canFocus: false
            });
            let buttonCopyToClipboardOut = new St.Button({
                label:_("Copy"),
                x_expand: true,
                xAlign: Clutter.ActorAlign.CENTER,
                reactive: true,
                marginLeft: 10,
                marginRight: 10,
                styleClass: "translate-assistant-button"
            });
            buttonCopyToClipboardOut.connect('clicked', ()=>{
                let inText = this.outputEntry.get_clutter_text().get_text();
                if(inText && inText !== ""){
                    this._copyToClipboard(inText);
                }
            });
            boxOut.add_child(buttonCopyToClipboardOut);
            let buttonPasteFromClipboardOut = new St.Button({
                label:_("Paste"),
                x_expand: true,
                xAlign: Clutter.ActorAlign.CENTER,
                reactive: true,
                marginLeft: 10,
                marginRight: 10,
                styleClass: "translate-assistant-button"
            });
            buttonPasteFromClipboardOut.connect('clicked', ()=>{
                St.Clipboard.get_default().get_text(CLIPBOARD_TYPE,(_, inText) => {
                    if(inText && inText !== ""){
                        this._copyToClipboard(inText);
                    }
                });
            });
            boxOut.add_child(buttonPasteFromClipboardOut);

            let iconsMenuItemOut = new PopupMenu.PopupBaseMenuItem({});
            iconsMenuItemOut.add_child(boxOut);
            return iconsMenuItemOut;
        }
        _menuIconsIn(){
            let boxIn = new St.BoxLayout({
                vertical: false,
                x_expand: true,
                trackHover: false,
                canFocus: false
            });
            let buttonCopyToClipboardIn = new St.Button({
                label:_("Copy"),
                x_expand: true,
                xAlign: Clutter.ActorAlign.CENTER,
                reactive: true,
                marginLeft: 10,
                marginRight: 10,
                styleClass: "translate-assistant-button"
            });
            buttonCopyToClipboardIn.connect('clicked', ()=>{
                let inText = this.inputEntry.get_clutter_text().get_text();
                if(inText && inText !== ""){
                    this._copyToClipboard(inText);
                }
            });
            boxIn.add_child(buttonCopyToClipboardIn);
            let buttonPasteFromClipboardIn = new St.Button({
                label:_("Paste"),
                x_expand: true,
                xAlign: Clutter.ActorAlign.CENTER,
                reactive: true,
                marginLeft: 10,
                marginRight: 10,
                styleClass: "translate-assistant-button"
            });
            buttonPasteFromClipboardIn.connect('clicked', ()=>{
                St.Clipboard.get_default().get_text(CLIPBOARD_TYPE,(_, inText) => {
                    if(inText && inText !== ""){
                        this.inputEntry.get_clutter_text().set_text(inText);
                    }
                });
            });
            boxIn.add_child(buttonPasteFromClipboardIn);

            let iconsMenuItemIn = new PopupMenu.PopupBaseMenuItem({});
            iconsMenuItemIn.add_child(boxIn);
            return iconsMenuItemIn;
        }

        _menuIcons(){
            let box = new St.BoxLayout({
                vertical: false,
                x_expand: true,
                trackHover: false,
                canFocus: false
            });
            let buttonRevert = new St.Button({
                label: "⇅",
                x_expand: true,
                xAlign: Clutter.ActorAlign.CENTER,
                reactive: true,
                marginLeft: 10,
                marginRight: 10,
                styleClass: "translate-assistant-button"

            });
            buttonRevert.connect('clicked', ()=>{
                if(this._source_lang === AUTO_LANG){
                    if(!this._detected_lang){
                        Main.notify("Translate Assistant",
                            _("Translate once so the source language can be detected"));
                        return;
                    }
                    this._source_lang = this._detected_lang;
                }
                const oldTargetLang = this._target_lang;
                this._target_lang = this._source_lang;
                this._source_lang = oldTargetLang;
                this.menuInputExpander.label.text = this._source_lang;
                this.menuOutputExpander.label.text = this._target_lang;
            });
            box.add_child(buttonRevert);
            let buttonTranslateFrom = new St.Button({
                label: "⌄",
                x_expand: true,
                xAlign: Clutter.ActorAlign.CENTER,
                reactive: true,
                marginLeft: 10,
                marginRight: 10,
                styleClass: "translate-assistant-button"
            });
            buttonTranslateFrom.connect('clicked', ()=>{
                let fromText = this.inputEntry.get_clutter_text().get_text();
                this._translateText(true, fromText, (toText) => {
                    this.outputEntry.get_clutter_text().set_text(toText);
                    if(this.autoCopySwitch.state === true){
                        this._copyToClipboard(toText);
                    }
                });
            });
            box.add_child(buttonTranslateFrom);
            let buttonTranslate = new St.Button({
                label: "⌃",
                x_expand: true,
                xAlign: Clutter.ActorAlign.CENTER,
                reactive: true,
                marginLeft: 10,
                marginRight: 10,
                styleClass: "translate-assistant-button"
            });
            buttonTranslate.connect('clicked', ()=>{
                let fromText = this.outputEntry.get_clutter_text().get_text();
                this._translateText(false, fromText, (toText) => {
                    this.inputEntry.get_clutter_text().set_text(toText);
                    if(this.autoCopySwitch.state === true){
                        this._copyToClipboard(toText);
                    }
                });
            });
            box.add_child(buttonTranslate);
            let iconsMenuItem = new PopupMenu.PopupBaseMenuItem({});
            iconsMenuItem.add_child(box);
            return iconsMenuItem;
        }

        _copyToClipboard(inText){
            if(this.autoPasteSwitch.state === true){
                this.autoPasteSwitch.setToggleState(false);
                St.Clipboard.get_default().set_text(CLIPBOARD_TYPE, inText);
                this.autoPasteSwitch.setToggleState(true);
            }else{
                St.Clipboard.get_default().set_text(CLIPBOARD_TYPE, inText);
            }
        }

        _menuInput(){
            this.inputEntry = new St.Entry({
                name: 'inputEntry',
                style_class: 'entry',
                can_focus: true,
                track_hover: true
            });
            this.inputEntry.get_clutter_text().set_line_wrap(true);
            this.inputEntry.get_clutter_text().set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
            this.inputEntry.get_clutter_text().set_single_line_mode(false);
            this.inputEntry.get_clutter_text().set_activatable(true);
            let box = new St.BoxLayout({
                vertical: true,
            });
            box.add_child(this.inputEntry);
            let scroll = new St.ScrollView({
                width: 300,
                height: 300
            });
            setScrollChild(scroll, box);
            this.menuInputExpander = new PopupMenu.PopupSubMenuMenuItem(this._source_lang);
            this.menuInputExpander.menu.box.add_child(
                this._languagePicker('source-lang'));
            this.menuInputExpander.menu.box.add_child(scroll);
            this.menuInputExpander.menu.box.add_child(this._menuIconsIn())
            return this.menuInputExpander;
        }

        _menuOutput(){
            this.outputEntry = new St.Entry({
                name: 'outputEntry',
                style_class: 'entry',
                can_focus: true,
                track_hover: true
            });
            this.outputEntry.get_clutter_text().set_line_wrap(true);
            this.outputEntry.get_clutter_text().set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
            this.outputEntry.get_clutter_text().set_single_line_mode(false);
            this.outputEntry.get_clutter_text().set_activatable(true);
            let box = new St.BoxLayout({
                vertical: true,
            });
            box.add_child(this.outputEntry);
            let scroll = new St.ScrollView({
                width: 300,
                height: 300
            });
            setScrollChild(scroll, box);
            this.menuOutputExpander = new PopupMenu.PopupSubMenuMenuItem(this._target_lang);
            this.menuOutputExpander.menu.box.add_child(
                this._languagePicker('target-lang'));
            this.menuOutputExpander.menu.box.add_child(scroll);
            this.menuOutputExpander.menu.box.add_child(this._menuIconsOut())
            return this.menuOutputExpander;
        }

        /* A button showing the current language that expands into a
         * scrollable list of all languages the setting allows. */
        _languagePicker(keyName){
            const box = new St.BoxLayout({
                vertical: true,
                x_expand: true
            });
            const toggle = new St.Button({
                label: this._getValue(keyName),
                x_expand: true,
                style_class: "translate-assistant-button"
            });
            const list = new St.BoxLayout({
                vertical: true
            });
            const scroll = new St.ScrollView({
                height: 200,
                visible: false
            });
            setScrollChild(scroll, list);
            const nicks = this._settings.settings_schema.get_key(keyName)
                .get_range().recursiveUnpack()[1];
            for (const nick of nicks) {
                const item = new St.Button({
                    child: new St.Label({
                        text: nick,
                        x_align: Clutter.ActorAlign.START
                    }),
                    x_expand: true,
                    style_class: "translate-assistant-language"
                });
                item.connect('clicked', () => {
                    scroll.hide();
                    this._settings.set_string(keyName, nick);
                });
                list.add_child(item);
            }
            toggle.connect('clicked', () => {
                scroll.visible = !scroll.visible;
            });
            this._languageButtons ??= {};
            this._languageButtons[keyName] = toggle;
            box.add_child(toggle);
            box.add_child(scroll);
            return box;
        }

        _getValue(keyName){
            return this._settings.get_value(keyName).deep_unpack();
        }

        _set_icon_indicator(){
            let active = this.autoPasteSwitch._switch.state;
            let themeString = (this._darktheme?'dark': 'light');
            let statusString = (active ? 'active' : 'paused');
            let iconString = `translate-assistant-${statusString}-${themeString}`;
            this.icon.set_gicon(this._get_icon(iconString));
        }

        _get_icon(iconName){
            const basePath = `${this._extension.path}/icons`;
            let fileIcon = Gio.File.new_for_path(
                `${basePath}/${iconName}.svg`);
            if(fileIcon.query_exists(null) == false){
                fileIcon = Gio.File.new_for_path(
                `${basePath}/${iconName}.png`);
            }
            if(fileIcon.query_exists(null) == false){
                return null;
            }
            return Gio.icon_new_for_string(fileIcon.get_path());
        }

        _settingsChanged(){
            this._loadPreferences();
            for (const [keyName, button] of Object.entries(this._languageButtons))
                button.label = this._getValue(keyName);
            this.menuInputExpander.label.text = this._source_lang;
            this.menuOutputExpander.label.text = this._target_lang;
        }

        destroy(){
            this._destroyed = true;
            this._disconnectSettings();
            this._unbindShortcut();
            this._disconnectSelectionListener();
            super.destroy();
        }
    }
);

export default class TranslateAssistantExtension extends Extension {
    enable() {
        migrateApiKey(this.getSettings()).catch(logError);
        this._translateAssistant = new TranslateAssistant(this);
        Main.panel.addToStatusArea(this.uuid, this._translateAssistant, 0, 'right');
    }

    disable() {
        this._translateAssistant?.destroy();
        this._translateAssistant = null;
    }
}
