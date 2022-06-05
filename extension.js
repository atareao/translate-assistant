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

const {Gtk, Gdk, Gio, Clutter, St, GObject, GLib, Pango, PangoCairo} = imports.gi;
const Cairo = imports.cairo;

const MessageTray = imports.ui.messageTray;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Extension = ExtensionUtils.getCurrentExtension();

const Gettext = imports.gettext.domain(Extension.uuid);
const _ = Gettext.gettext;

const SHELL_KEYBINDINGS_SCHEMA = "org.gnome.shell.keybindings";
const SHORTCUT_SETTING_KEY = "translate-assistant-clipboard";

var button;


function notify(msg, details, icon='translate-assistant-icon') {
    let source = new MessageTray.Source(Extension.uuid, icon);
    Main.messageTray.add(source);
    let notification = new MessageTray.Notification(source, msg, details);
    notification.setTransient(true);
    source.notify(notification);
}

var TranslateAssistant = GObject.registerClass(
    class TranslateAssistant extends PanelMenu.Button{
        _init(){
            super._init(St.Align.START);
            this._settings = ExtensionUtils.getSettings();
            this._loadPreferences();

            /* Icon indicator */
            let box = new St.BoxLayout();
            this.icon = new St.Icon({style_class: 'system-status-icon'});
            box.add(this.icon);
            this._timeLeft = new St.Label({
                text: '-',
                y_expand: true,
                y_align: Clutter.ActorAlign.CENTER });
            box.add(this._timeLeft);
            this.add_child(box);

            /* Start Menu */
            //let itemBatteryCharge = this._getBatteryChargeMenuItem();
            //this.menu.addMenuItem(itemBatteryCharge);

            //let itemBatteryHealth = this._getBatteryHealthMenuItem();
            //this.menu.addMenuItem(itemBatteryHealth);

            /* Separator */
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            /* Setings */
            this.settingsMenuItem = new PopupMenu.PopupMenuItem(_("Settings"));
            this.settingsMenuItem.connect('activate', () => {
                ExtensionUtils.openPrefs();
            });
            this.menu.addMenuItem(this.settingsMenuItem);
            /* Init */
            this._set_icon_indicator(false);
            this._settingsChanged();
            this._settings.connect('changed',
                                   this._settingsChanged.bind(this));
        }

        _loadPreferences(){
            this._source_lang = this._getValue('source-lang');
            this._target_lang = this._getValue('target-lang');
            this._split_sentences = this._getValue('split-sentences');
            this._preserve_formatting = this._getValue('preserve-formatting');
            this._formality = this._getValue('formality');
            this._apikey = this._getValue('apikey');
            this._keybinding_translate_clipboard = this._getValue('keybinding-translate-clipboard');
            this._darktheme = this._getValue('darktheme');

            this._unbindShortcut();
            this._bindShortcut();
        }

        _bindShortcut(){
            Main.wm.addKeybinding("keybinding-translate-clipboard",
                                  this._settings,
                                  Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
                                  Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW
                                  this._translate.bind(this)
            );
        }

        _unbindShortcut(){
            Main.wm.removeKeybinding(SHORTCUT_SETTING_KEY);
        }

        _translate(){
            log(`Combinación de teclas ${this._keybinding_translate_clipboard} pulsada`);
        }

        _getBatteryHealthMenuItem(){
            let itemBatteryHealth = new PopupMenu.PopupBaseMenuItem({
                reactive: false
            });
            let batteryHealthBox = new St.BoxLayout({
                vertical: true
            });
            itemBatteryHealth.add_actor(batteryHealthBox);
            batteryHealthBox.add_actor(new St.Label({
                                text: _('Battery health')
            }));
           let batteryHealthInnerBox = new St.BoxLayout({
                                vertical: true,
                                style_class: 'message battery-box'
                            });
            batteryHealthBox.add_actor(batteryHealthInnerBox);
            this._currentMax = new St.Label({
                text: '5162 mAh',
               x_expand: true,
               x_align: Clutter.ActorAlign.END });
               batteryHealthInnerBox.add_actor(this._getRow(
                // Translators: The current maximum battery capacity
                _('Current max:'),
                this._currentMax
            ));
            this._originalMax = new St.Label({
                text: '5770 mAh',
               x_expand: true,
               x_align: Clutter.ActorAlign.END });
               batteryHealthInnerBox.add_actor(this._getRow(
                // Translators: The original maximum battery capacity
                _('Original max:'),
                this._originalMax
            ));
            let cc = new St.BoxLayout({
                                x_align: Clutter.ActorAlign.CENTER,
                                y_align: Clutter.ActorAlign.CENTER,
                            });
            batteryHealthInnerBox.add_actor(cc);
            this._batteryHealthPie = new PieChart(70, 70, 30, this._warning,
                this._danger, this._normalColor, this._warningColor,
                this._dangerColor);
            cc.add_actor(this._batteryHealthPie);
            this._voltageNow = new St.Label({
                text: '7,498 V',
               x_expand: true,
               x_align: Clutter.ActorAlign.END });
            batteryHealthInnerBox.add_actor(this._getRow(
                _('Voltage now:'),
                this._voltageNow
            ));
            this._originalVoltage = new St.Label({
                text: '7,640 V',
               x_expand: true,
               x_align: Clutter.ActorAlign.END });
            batteryHealthInnerBox.add_actor(this._getRow(
                _('Original voltage:'),
                this._originalVoltage
            ));
            return itemBatteryHealth;
        }

        _getValue(keyName){
            return this._settings.get_value(keyName).deep_unpack();
        }

        _set_icon_indicator(active){
            let themeString = (this._darktheme?'dark': 'light');
            let statusString = (active ? 'active' : 'paused');
            let iconString = `translate-assistant-${statusString}-${themeString}`;
            this.icon.set_gicon(this._get_icon(iconString));
        }

        _get_icon(iconName){
            const basePath = Extension.dir.get_child("icons").get_path();
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
        }

        disable(){
            this._unbindShortcut();
        }
    }
);

let translateAssistant;

function init(){
    ExtensionUtils.initTranslations();
}

function enable(){
    translateAssistant = new TranslateAssistant();
    Main.panel.addToStatusArea('translateAssistant', translateAssistant, 0, 'right');
}

function disable() {
    translateAssistant.disable();
    translateAssistant = null;
}
