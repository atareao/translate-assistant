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

import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import * as Widgets from './preferenceswidget.js';
import {AboutPage} from './aboutpage.js';
import {migrateApiKey} from './secret.js';

const TranslateAssistantPreferencesWidget = GObject.registerClass(
    class TranslateAssistantPreferencesWidget extends Widgets.ListWithStack{
        _init(settings, migrated){
            super._init({});

            let preferencesPage = new Widgets.Page();


            let indicatorSection = preferencesPage.addFrame(
                _("Indicator options"));
            indicatorSection.addWidgetSetting(
                settings,
                "source-lang",
                new Widgets.EnumSetting(settings, "source-lang"));
            indicatorSection.addWidgetSetting(
                settings,
                "target-lang",
                new Widgets.EnumSetting(settings, "target-lang"));
            indicatorSection.addGSetting(settings, "split-sentences");
            indicatorSection.addGSetting(settings, "preserve-formatting");
            indicatorSection.addWidgetSetting(
                settings,
                "formality",
                new Widgets.EnumSetting(settings, "formality"));
            indicatorSection.addGSetting(settings, "url");
            indicatorSection.addWidgetSetting(
                settings,
                "apikey",
                new Widgets.ApiKeySetting(migrated));


            const themePage = new Widgets.Page();
            const styleSection = themePage.addFrame(_("Theme"));
            styleSection.addGSetting(settings, "notifications");
            styleSection.addGSetting(settings, "darktheme");
            styleSection.addWidgetSetting(
                settings,
                "keybinding-translate-clipboard",
                new Widgets.ShortcutSetting(settings,
                                            "keybinding-translate-clipboard"));
            const autoPage = new Widgets.Page();
            const autoSection = autoPage.addFrame(_("Auto Options"));
            autoSection.addGSetting(settings, "auto-paste");
            autoSection.addGSetting(settings, "auto-translate");
            autoSection.addGSetting(settings, "auto-copy");

            this.add(_("Translate Assistant Preferences"),
                     "preferences-other-symbolic",
                     preferencesPage);
            this.add(_("Auto Options"), "preferences-system-details-symbolic", autoPage);
            this.add(_("Style"), "style", themePage);
            this.add(_("About"), "help-about-symbolic", new AboutPage());
        }
    }
);

export default class TranslateAssistantPreferences extends ExtensionPreferences {
    // getPreferencesWidget() would be wrapped in a width-clamped
    // Adw.PreferencesPage, cutting off this two-pane layout, so the
    // widget replaces the window content instead.
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const migrated = migrateApiKey(settings);
        const toolbarView = new Adw.ToolbarView({
            content: new TranslateAssistantPreferencesWidget(settings, migrated),
        });
        toolbarView.add_top_bar(new Adw.HeaderBar());
        // The prefs loader rejects windows without a visible_page,
        // so register an empty page before swapping the content.
        window.add(new Adw.PreferencesPage());
        window.set_content(toolbarView);
        window.set_title(_("Translate Assistant Configuration"));
        window.set_default_size(850, 800);
    }
}
