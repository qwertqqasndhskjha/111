import {
    name1, // name1 通常是用户
    name2, // name2 通常是角色
    eventSource,
    event_types,
    isStreamingEnabled,
    saveSettingsDebounced,
} from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { selected_group } from '../../../group-chats.js';
import { t } from '../../../i18n.js';

const MODULE = 'typing_indicator';
const legacyIndicatorTemplate = document.getElementById('typing_indicator_template');

/**
 * @typedef {Object} Theme
 * @property {string} css - 主题的 CSS 内容。
 */

/**
 * @typedef {Object} CharacterBinding
 * @property {string} activeCustomText - 绑定的内容预设名称
 * @property {string} activeTheme - 绑定的外观主题名称
 */

/**
 * @typedef {Object} TypingIndicatorSettings
 * @property {boolean} enabled
 * @property {boolean} streaming
 * @property {boolean} showCharName
 * @property {boolean} animationEnabled - 是否启用末尾的...动画。
 * @property {boolean} isPreviewEnabled - 是否在设置中显示预览。
 * @property {string} fontColor
 * @property {Object.<string, string>} customTexts - 保存的自定义文本预设
 * @property {string} activeCustomText - 当前激活的预设名称
 * @property {Object.<string, Theme>} themes
 * @property {string} activeTheme
 * @property {Object.<string, CharacterBinding>} characterBindings - 角色绑定设置
 */

/**
 * @type {TypingIndicatorSettings}
 */
const defaultSettings = {
    enabled: false,
    streaming: false,
    showCharName: false,
    animationEnabled: true,
    isPreviewEnabled: true,
    fontColor: '',
    activeCustomText: '默认',
    customTexts: {
        '默认': '正在输入',
    },
    activeTheme: '默认',
    themes: {
        '默认': {
            css: '/* 默认主题：不应用额外样式。 */',
        },
        '渐变脉冲': {
            css: `
#typing_indicator .typing-ellipsis { display: none; }
#typing_indicator div.typing-indicator-text {
    font-weight: bold;
    background: linear-gradient(90deg, #ff00de, #00f2ff, #ff00de);
    background-size: 200% 200%;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: gradient-pulse 3s ease-in-out infinite;
}
@keyframes gradient-pulse {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}
            `,
        },
    },
    characterBindings: {}, // 新增：角色绑定
};

/**
 * 获取此扩展的设置。
 */
function getSettings() {
    if (extension_settings[MODULE] === undefined) {
        extension_settings[MODULE] = structuredClone(defaultSettings);
    }
    // 迁移旧版数据结构
    if (extension_settings[MODULE].customText && !extension_settings[MODULE].customTexts) {
        extension_settings[MODULE].customTexts = { '默认': extension_settings[MODULE].customText };
        extension_settings[MODULE].activeCustomText = '默认';
        delete extension_settings[MODULE].customText;
    }
    for (const key in defaultSettings) {
        if (extension_settings[MODULE][key] === undefined) {
            extension_settings[MODULE][key] = defaultSettings[key];
        }
    }
    return extension_settings[MODULE];
}


/**
 * 应用指定主题的 CSS。
 * @param {string} cssContent 要应用的 CSS 字符串。
 */
function applyCss(cssContent) {
    let styleTag = document.getElementById('typing-indicator-theme-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'typing-indicator-theme-style';
        document.head.appendChild(styleTag);
    }
    // 通过替换选择器，确保自定义主题能同时正确应用到真实指示器和预览指示器上。
    const realCss = cssContent.replace(/#typing_indicator/g, '#chat #typing_indicator');
    const previewCss = cssContent.replace(/#typing_indicator/g, '#ti_preview_indicator');
    styleTag.textContent = realCss + '\n' + previewCss;
}

/**
 * 将扩展所需的全局 CSS 注入到文档头部。
 */
function injectGlobalStyles() {
    const css = `
        /* 1. 共享的基础外观（无布局属性） */
        .typing_indicator {
            opacity: 1 !important;
            padding: 8px 5px;
            border-radius: 8px;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 0.2em;
            margin: 5px 0; /* 默认的上下边距 */
        }

        /* 2. 仅用于设置中预览框的特殊布局 */
        #ti_preview_indicator {
            margin-left: auto;
            margin-right: auto;
            width: fit-content;
            min-width: 150px;
        }

        /* 预览容器样式 */
        #ti_preview_container {
             background-color: transparent;
             border-radius: 8px;
             padding: 10px 0;
             margin: 10px 0;
        }
        .ti-preview-title {
            font-weight: bold;
            font-size: 1em;
            margin-bottom: 15px;
            padding-left: 10px;
        }

        /* 省略号动画 */
        .typing-ellipsis::after {
            display: inline-block;
            animation: ellipsis-animation 1.4s infinite;
            content: '.';
            width: 1.2em;
            text-align: left;
            vertical-align: bottom;
        }
        @keyframes ellipsis-animation {
            0% { content: '.'; }
            33% { content: '..'; }
            66%, 100% { content: '...'; }
        }

        /* 复选框网格布局 (新增) */
        .ti-checkbox-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 5px 15px; /* 行间距 列间距 */
            margin: 8px 0;
        }
        .ti-checkbox-grid .checkbox_label {
            margin: 0; /* 清除label自带的margin */
        }

        /* 字体颜色选择器 UI */
        .ti_color_picker_wrapper {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin: 8px 0;
            padding: 5px 10px;
            background-color: var(--background_panel);
            border-radius: 8px;
        }
        .ti_color_picker_wrapper > span {
            font-weight: bold;
        }
        .ti_color_input_container {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .ti_color_input_container input[type="color"] {
            -webkit-appearance: none;
            -moz-appearance: none;
            appearance: none;
            width: 28px;
            height: 28px;
            padding: 0;
            border: 1px solid var(--border_color);
            border-radius: 6px;
            background-color: transparent;
            cursor: pointer;
        }
        .ti_color_input_container input[type="color"]::-webkit-color-swatch-wrapper {
            padding: 0;
        }
        .ti_color_input_container input[type="color"]::-webkit-color-swatch {
            border: none;
            border-radius: 4px;
        }
        .ti_color_input_container input[type="color"]::-moz-color-swatch {
            border: none;
            border-radius: 4px;
        }
        .ti_reset_color_btn {
            background: none;
            border: none;
            color: var(--text_color_secondary);
            cursor: pointer;
            font-size: 1em;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .ti_reset_color_btn:hover {
            color: var(--text_color_attention);
        }

        /* CSS 编辑器样式 */
        .ti-css-editor {
            width: 100%;
            box-sizing: border-box;
            line-height: 1.5;
            min-height: 80px;
            max-height: 250px;
            resize: vertical;
            overflow: auto;
        }

        /* 【已修复】为移动端增加最小高度 */
        @media (max-width: 768px) {
            .ti-css-editor {
                min-height: 160px;
            }
        }
        
        /* 角色绑定UI样式 */
        .ti-char-binding-container {
            margin-top: 15px;
            padding: 10px;
            background-color: var(--background_panel);
            border-radius: 8px;
        }
        .ti-char-binding-title {
            font-weight: bold;
            margin-bottom: 10px;
        }
        .ti-char-binding-controls {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .ti-char-binding-controls > label {
             display: flex;
             justify-content: space-between;
             align-items: center;
        }
        .ti-char-binding-controls select {
             flex-basis: 60%;
        }

    `;
    let styleTag = document.getElementById('typing-indicator-global-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'typing-indicator-global-style';
        styleTag.textContent = css;
        document.head.appendChild(styleTag);
    }
}


/**
 * 绘制此扩展的设置界面。
 */
function addExtensionSettings(settings) {
    const settingsContainer = document.getElementById('typing_indicator_container') ?? document.getElementById('extensions_settings');
    if (!settingsContainer) return;

    const inlineDrawer = document.createElement('div');
    inlineDrawer.classList.add('inline-drawer');
    settingsContainer.append(inlineDrawer);

    const inlineDrawerToggle = document.createElement('div');
    inlineDrawerToggle.classList.add('inline-drawer-toggle', 'inline-drawer-header');
    const extensionName = document.createElement('b');
    extensionName.textContent = t`正在输入中…`;
    const inlineDrawerIcon = document.createElement('div');
    inlineDrawerIcon.classList.add('inline-drawer-icon', 'fa-solid', 'fa-circle-chevron-down', 'down');
    inlineDrawerToggle.append(extensionName, inlineDrawerIcon);

    const inlineDrawerContent = document.createElement('div');
    inlineDrawerContent.classList.add('inline-drawer-content');
    inlineDrawer.append(inlineDrawerToggle, inlineDrawerContent);
    
    let refreshCharacterBindingUI;

    const refreshIndicator = () => {
        const indicator = document.getElementById('typing_indicator');
        if (indicator) {
            showTypingIndicator('refresh', null, false);
        }
        if (refreshCharacterBindingUI) refreshCharacterBindingUI();
    };
    
    // -- 预览区域 --
    const previewContainer = document.createElement('div');
    previewContainer.id = 'ti_preview_container';
    const previewTitle = document.createElement('div');
    previewTitle.className = 'ti-preview-title';
    previewTitle.textContent = t`预览`;
    const previewIndicator = document.createElement('div');
    previewIndicator.id = 'ti_preview_indicator';
    previewIndicator.classList.add('typing_indicator');
    previewContainer.append(previewTitle, previewIndicator);

    const refreshPreview = () => {
        if (!settings.isPreviewEnabled) {
            previewContainer.style.display = 'none';
            return;
        }
        previewContainer.style.display = 'block';

        const charName = name2 || t`角色`;
        const binding = settings.characterBindings[charName];

        const activePresetName = binding?.activeCustomText || settings.activeCustomText || '默认';
        let finalText = settings.customTexts[activePresetName] || defaultSettings.customTexts['默认'];

        const placeholder = '{char}';
        if (settings.showCharName) {
            finalText = finalText.includes(placeholder) ? finalText.replace(placeholder, charName) : `${charName}${finalText}`;
        } else {
            finalText = finalText.replace(placeholder, '').replace(/  +/g, ' ').trim();
        }

        if (!finalText && !settings.animationEnabled) finalText = `...`;
        
        const animationHtml = settings.animationEnabled ? '<div class="typing-ellipsis"></div>' : '';
        const textHtml = `<div class="typing-indicator-text">${finalText}</div>`;
        
        previewIndicator.innerHTML = textHtml + animationHtml;
        previewIndicator.style.color = settings.fontColor || '';
        
        const activeThemeName = binding?.activeTheme || settings.activeTheme;
        const theme = settings.themes[activeThemeName];
        if (theme) {
            applyCss(theme.css);
        }
    };


    // -- 主要设置项 (两列布局修改) --
    const checkboxGrid = document.createElement('div');
    checkboxGrid.className = 'ti-checkbox-grid';

    const enabledCheckboxLabel = document.createElement('label');
    enabledCheckboxLabel.classList.add('checkbox_label');
    const enabledCheckbox = document.createElement('input');
    enabledCheckbox.type = 'checkbox';
    enabledCheckbox.checked = settings.enabled;
    enabledCheckbox.addEventListener('change', () => {
        settings.enabled = enabledCheckbox.checked;
        saveSettingsDebounced();
    });
    enabledCheckboxLabel.append(enabledCheckbox, document.createTextNode(t`启用`));
    checkboxGrid.append(enabledCheckboxLabel);

    const showIfStreamingCheckboxLabel = document.createElement('label');
    showIfStreamingCheckboxLabel.classList.add('checkbox_label');
    const showIfStreamingCheckbox = document.createElement('input');
    showIfStreamingCheckbox.type = 'checkbox';
    showIfStreamingCheckbox.checked = settings.streaming;
    showIfStreamingCheckbox.addEventListener('change', () => {
        settings.streaming = showIfStreamingCheckbox.checked;
        saveSettingsDebounced();
    });
    showIfStreamingCheckboxLabel.append(showIfStreamingCheckbox, document.createTextNode(t`流式传输时显示`));
    checkboxGrid.append(showIfStreamingCheckboxLabel);

    const animationEnabledCheckboxLabel = document.createElement('label');
    animationEnabledCheckboxLabel.classList.add('checkbox_label');
    const animationEnabledCheckbox = document.createElement('input');
    animationEnabledCheckbox.type = 'checkbox';
    animationEnabledCheckbox.checked = settings.animationEnabled;
    animationEnabledCheckbox.addEventListener('change', () => {
        settings.animationEnabled = animationEnabledCheckbox.checked;
        saveSettingsDebounced();
        refreshIndicator();
        refreshPreview();
    });
    animationEnabledCheckboxLabel.append(animationEnabledCheckbox, document.createTextNode(t`启用动画`));
    checkboxGrid.append(animationEnabledCheckboxLabel);
    
    const showNameCheckboxLabel = document.createElement('label');
    showNameCheckboxLabel.classList.add('checkbox_label');
    const showNameCheckbox = document.createElement('input');
    showNameCheckbox.type = 'checkbox';
    showNameCheckbox.checked = settings.showCharName;
    showNameCheckbox.addEventListener('change', () => {
        settings.showCharName = showNameCheckbox.checked;
        saveSettingsDebounced();
        refreshIndicator();
        refreshPreview();
    });
    showNameCheckboxLabel.append(showNameCheckbox, document.createTextNode(t`显示角色名称`));
    checkboxGrid.append(showNameCheckboxLabel);

    const isPreviewEnabledCheckboxLabel = document.createElement('label');
    isPreviewEnabledCheckboxLabel.classList.add('checkbox_label');
    const isPreviewEnabledCheckbox = document.createElement('input');
    isPreviewEnabledCheckbox.type = 'checkbox';
    isPreviewEnabledCheckbox.checked = settings.isPreviewEnabled;
    isPreviewEnabledCheckbox.addEventListener('change', () => {
        settings.isPreviewEnabled = isPreviewEnabledCheckbox.checked;
        saveSettingsDebounced();
        refreshPreview();
    });
    isPreviewEnabledCheckboxLabel.append(isPreviewEnabledCheckbox, document.createTextNode(t`启用预览`));
    checkboxGrid.append(isPreviewEnabledCheckboxLabel);
    
    inlineDrawerContent.append(checkboxGrid); // 将整个网格添加到设置内容中

    // 字体颜色选择器
    const colorPickerWrapper = document.createElement('div');
    colorPickerWrapper.className = 'ti_color_picker_wrapper';
    const colorPickerTextLabel = document.createElement('span');
    colorPickerTextLabel.textContent = t`字体颜色`;
    const colorInputContainer = document.createElement('div');
    colorInputContainer.className = 'ti_color_input_container';
    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.value = settings.fontColor || '#ffffff';
    colorPicker.addEventListener('input', () => {
        settings.fontColor = colorPicker.value;
        saveSettingsDebounced();
        refreshIndicator();
        refreshPreview();
    });
    const resetButton = document.createElement('button');
    resetButton.className = 'ti_reset_color_btn';
    resetButton.title = t`重置`;
    resetButton.innerHTML = '<i class="fa-solid fa-arrow-rotate-left"></i>';
    resetButton.addEventListener('click', () => {
        settings.fontColor = '';
        colorPicker.value = '#ffffff';
        saveSettingsDebounced();
        refreshIndicator();
        refreshPreview();
    });
    colorInputContainer.append(colorPicker, resetButton);
    colorPickerWrapper.append(colorPickerTextLabel, colorInputContainer);
    inlineDrawerContent.append(colorPickerWrapper);

    // 将预览框放在此处
    inlineDrawerContent.append(previewContainer);

    // 自定义内容部分
    const customContentDivider = document.createElement('hr');
    inlineDrawerContent.append(customContentDivider);

    const customContentContainer = document.createElement('div');
    customContentContainer.style.marginTop = '10px';

    const presetSelectorLabel = document.createElement('label');
    presetSelectorLabel.textContent = t`内容预设：`;
    const presetSelector = document.createElement('select');
    const customTextInput = document.createElement('input');

    const populatePresets = () => {
        presetSelector.innerHTML = '';
        Object.keys(settings.customTexts).forEach(presetName => {
            const option = document.createElement('option');
            option.value = presetName;
            option.textContent = presetName;
            presetSelector.appendChild(option);
        });
        presetSelector.value = settings.activeCustomText;
    };
    const loadPresetIntoEditor = (presetName) => {
        customTextInput.value = settings.customTexts[presetName] || '';
    };

    populatePresets();
    
    presetSelector.addEventListener('change', () => {
        settings.activeCustomText = presetSelector.value;
        loadPresetIntoEditor(settings.activeCustomText);
        saveSettingsDebounced();
        refreshIndicator();
        refreshPreview();
    });
    
    customTextInput.type = 'text';
    customTextInput.placeholder = t`输入显示的文字`;
    customTextInput.style.width = '95%';
    customTextInput.style.margin = '5px 0';
    customTextInput.addEventListener('input', () => {
        settings.customTexts[settings.activeCustomText] = customTextInput.value;
        saveSettingsDebounced();
        refreshIndicator();
        refreshPreview();
    });

    const placeholderHint = document.createElement('small');
    placeholderHint.textContent = t`使用 {char} 作为角色名称的占位符。`;
    placeholderHint.style.display = 'block';
    placeholderHint.style.marginTop = '4px';
    placeholderHint.style.color = 'var(--text_color_secondary)';

    const presetButtonContainer = document.createElement('div');
    presetButtonContainer.style.display = 'flex';
    presetButtonContainer.style.gap = '10px';
    presetButtonContainer.style.marginTop = '5px';
    const newPresetButton = document.createElement('button');
    newPresetButton.textContent = t`新建预设`;
    newPresetButton.classList.add('primary-button');
    const deletePresetButton = document.createElement('button');
    deletePresetButton.textContent = t`删除预设`;
    deletePresetButton.classList.add('danger-button');
    presetButtonContainer.append(newPresetButton, deletePresetButton);

    newPresetButton.addEventListener('click', () => {
        const newPresetName = prompt(t`请输入新预设的名称：`);
        if (newPresetName && !settings.customTexts[newPresetName]) {
            settings.customTexts[newPresetName] = t`新的预设`;
            settings.activeCustomText = newPresetName;
            populatePresets();
            loadPresetIntoEditor(newPresetName);
            saveSettingsDebounced();
            refreshPreview();
            if(refreshCharacterBindingUI) refreshCharacterBindingUI();
        } else if (settings.customTexts[newPresetName]) {
            alert(t`该名称的预设已存在！`);
        }
    });

    deletePresetButton.addEventListener('click', () => {
        const presetToDelete = presetSelector.value;
        if (presetToDelete === '默认') {
            alert(t`无法删除默认预设。`);
            return;
        }
        if (confirm(t`您确定要删除预设 '${presetToDelete}' 吗？`)) {
            delete settings.customTexts[presetToDelete];
            settings.activeCustomText = '默认';
            populatePresets();
            loadPresetIntoEditor(settings.activeCustomText);
            saveSettingsDebounced();
            refreshIndicator();
            refreshPreview();
            if(refreshCharacterBindingUI) refreshCharacterBindingUI();
        }
    });

    customContentContainer.append(presetSelectorLabel, presetSelector, customTextInput, placeholderHint, presetButtonContainer);
    inlineDrawerContent.append(customContentContainer);
    loadPresetIntoEditor(settings.activeCustomText);


    // 角色绑定区域
    const charBindingContainer = document.createElement('div');
    charBindingContainer.className = 'ti-char-binding-container';
    
    const charBindingTitle = document.createElement('div');
    charBindingTitle.className = 'ti-char-binding-title';
    
    const charBindingControls = document.createElement('div');
    charBindingControls.className = 'ti-char-binding-controls';
    
    charBindingContainer.append(charBindingTitle, charBindingControls);

    refreshCharacterBindingUI = () => {
        const currentCharName = name2;
        if (!currentCharName) {
            charBindingContainer.style.display = 'none';
            return;
        }
        charBindingContainer.style.display = 'block';
        charBindingTitle.textContent = t`为角色 '${currentCharName}' 单独设置：`;
        charBindingControls.innerHTML = '';

        const binding = settings.characterBindings[currentCharName] || {};

        const textBindingLabel = document.createElement('label');
        textBindingLabel.textContent = t`内容预设：`;
        const textBindingSelector = document.createElement('select');
        Object.keys(settings.customTexts).forEach(presetName => {
            const option = document.createElement('option');
            option.value = presetName;
            option.textContent = presetName;
            textBindingSelector.appendChild(option);
        });
        textBindingSelector.value = binding.activeCustomText || settings.activeCustomText;
        textBindingSelector.addEventListener('change', () => {
             if (!settings.characterBindings[currentCharName]) settings.characterBindings[currentCharName] = {};
             settings.characterBindings[currentCharName].activeCustomText = textBindingSelector.value;
             saveSettingsDebounced();
             refreshPreview();
        });
        textBindingLabel.append(textBindingSelector);

        const themeBindingLabel = document.createElement('label');
        themeBindingLabel.textContent = t`外观主题：`;
        const themeBindingSelector = document.createElement('select');
        Object.keys(settings.themes).forEach(themeName => {
            const option = document.createElement('option');
            option.value = themeName;
            option.textContent = themeName;
            themeBindingSelector.appendChild(option);
        });
        themeBindingSelector.value = binding.activeTheme || settings.activeTheme;
        themeBindingSelector.addEventListener('change', () => {
            if (!settings.characterBindings[currentCharName]) settings.characterBindings[currentCharName] = {};
            settings.characterBindings[currentCharName].activeTheme = themeBindingSelector.value;
            saveSettingsDebounced();
            refreshPreview();
        });
        themeBindingLabel.append(themeBindingSelector);
        
        const clearBindingButton = document.createElement('button');
        clearBindingButton.textContent = t`清除此角色绑定`;
        clearBindingButton.classList.add('danger-button');
        clearBindingButton.style.marginTop = '5px';
        clearBindingButton.addEventListener('click', () => {
            if(confirm(t`确定要清除角色 '${currentCharName}' 的所有绑定设置吗？`)) {
                delete settings.characterBindings[currentCharName];
                saveSettingsDebounced();
                refreshCharacterBindingUI();
                refreshPreview();
            }
        });

        charBindingControls.append(textBindingLabel, themeBindingLabel, clearBindingButton);
    };

    inlineDrawerContent.append(charBindingContainer);
    refreshCharacterBindingUI();


    // 主题管理部分
    const themeDivider = document.createElement('hr');
    inlineDrawerContent.append(themeDivider);

    const themeSelectorLabel = document.createElement('label');
    themeSelectorLabel.textContent = t`全局外观主题：`;
    const themeSelector = document.createElement('select');
    const cssEditor = document.createElement('textarea');
    cssEditor.classList.add('ti-css-editor');

    const populateThemes = () => {
        themeSelector.innerHTML = '';
        Object.keys(settings.themes).forEach(themeName => {
            const option = document.createElement('option');
            option.value = themeName;
            option.textContent = themeName;
            themeSelector.appendChild(option);
        });
        themeSelector.value = settings.activeTheme;
    };
    const loadThemeIntoEditor = (themeName) => {
        cssEditor.value = settings.themes[themeName]?.css || '';
    };
    const applyActiveTheme = (charName = null) => {
        let activeThemeName = settings.activeTheme;
        if (charName && settings.characterBindings[charName]?.activeTheme) {
            activeThemeName = settings.characterBindings[charName].activeTheme;
        }
        const theme = settings.themes[activeThemeName];
        if (theme) {
            applyCss(theme.css);
        }
    };

    populateThemes();
    inlineDrawerContent.append(themeSelectorLabel, themeSelector);

    const cssEditorLabel = document.createElement('label');
    cssEditorLabel.textContent = t`主题 CSS (高级)：`;
    cssEditorLabel.style.display = 'block';
    cssEditorLabel.style.marginTop = '10px';
    cssEditor.placeholder = t`在此处输入 CSS 代码可实时预览。`;
    inlineDrawerContent.append(cssEditorLabel, cssEditor);
    
    const themeButtonContainer = document.createElement('div');
    themeButtonContainer.style.display = 'flex';
    themeButtonContainer.style.gap = '10px';
    themeButtonContainer.style.marginTop = '5px';
    const saveThemeButton = document.createElement('button');
    saveThemeButton.textContent = t`保存当前主题`;
    saveThemeButton.classList.add('primary-button');
    const newThemeButton = document.createElement('button');
    newThemeButton.textContent = t`新建主题`;
    newThemeButton.classList.add('primary-button');
    const deleteThemeButton = document.createElement('button');
    deleteThemeButton.textContent = t`删除主题`;
    deleteThemeButton.classList.add('danger-button'); 
    themeButtonContainer.append(saveThemeButton, newThemeButton, deleteThemeButton);
    inlineDrawerContent.append(themeButtonContainer);

    cssEditor.addEventListener('input', () => {
        applyCss(cssEditor.value);
    });

    themeSelector.addEventListener('change', () => {
        const selectedTheme = themeSelector.value;
        settings.activeTheme = selectedTheme;
        loadThemeIntoEditor(selectedTheme);
        applyActiveTheme(name2);
        saveSettingsDebounced();
        refreshPreview();
    });
    saveThemeButton.addEventListener('click', () => {
        const currentThemeName = themeSelector.value;
        settings.themes[currentThemeName].css = cssEditor.value;
        saveSettingsDebounced();
        alert(t`主题 '${currentThemeName}' 已保存！`);
    });
    newThemeButton.addEventListener('click', () => {
        const newThemeName = prompt(t`请输入新主题的名称：`);
        if (newThemeName && !settings.themes[newThemeName]) {
            settings.themes[newThemeName] = { css: `/* ${newThemeName} 的 CSS */` };
            settings.activeTheme = newThemeName;
            populateThemes();
            loadThemeIntoEditor(newThemeName);
            applyCss(settings.themes[newThemeName].css);
            saveSettingsDebounced();
            refreshPreview();
            if(refreshCharacterBindingUI) refreshCharacterBindingUI();
        } else if (settings.themes[newThemeName]) {
            alert(t`该名称的主题已存在！`);
        }
    });
    deleteThemeButton.addEventListener('click', () => {
        const themeToDelete = themeSelector.value;
        if (themeToDelete === '默认') {
            alert(t`无法删除默认主题。`);
            return;
        }
        if (confirm(t`您确定要删除主题 '${themeToDelete}' 吗？`)) {
            delete settings.themes[themeToDelete];
            settings.activeTheme = '默认';
            populateThemes();
            loadThemeIntoEditor(settings.activeTheme);
            applyActiveTheme(name2);
            saveSettingsDebounced();
            refreshPreview();
            if(refreshCharacterBindingUI) refreshCharacterBindingUI();
        }
    });
    
    loadThemeIntoEditor(settings.activeTheme);
    refreshPreview();
}

/**
 * 在聊天中显示一个打字指示器。
 */
function showTypingIndicator(type, _args, dryRun) {
    const settings = getSettings();
    const noIndicatorTypes = ['quiet', 'impersonate'];

    if (type !== 'refresh' && (noIndicatorTypes.includes(type) || dryRun)) {
        return;
    }

    if (!settings.enabled || (!settings.streaming && isStreamingEnabled())) {
        return;
    }
    
    if (settings.showCharName && !name2) {
        return;
    }

    if (legacyIndicatorTemplate && selected_group && !isStreamingEnabled()) {
        return;
    }
    
    const charName = name2;
    const binding = charName ? settings.characterBindings[charName] : undefined;

    const activePresetName = binding?.activeCustomText || settings.activeCustomText || '默认';
    const activeThemeName = binding?.activeTheme || settings.activeTheme;
    
    const theme = settings.themes[activeThemeName];
    if(theme) applyCss(theme.css);

    let finalText = settings.customTexts[activePresetName] || defaultSettings.customTexts['默认'];

    const placeholder = '{char}';
    if (settings.showCharName && charName) {
        finalText = finalText.includes(placeholder) ? finalText.replace(placeholder, charName) : `${charName}${finalText}`;
    } else {
        finalText = finalText.replace(placeholder, '').replace(/  +/g, ' ').trim();
    }

    if (!finalText && !settings.animationEnabled) return;

    const animationHtml = settings.animationEnabled ? '<div class="typing-ellipsis"></div>' : '';
    const textHtml = `<div class="typing-indicator-text">${finalText}</div>`;
    const htmlContent = textHtml + animationHtml;
    const colorStyle = settings.fontColor ? settings.fontColor : '';

    let typingIndicator = document.getElementById('typing_indicator');
    if (typingIndicator) {
        typingIndicator.innerHTML = htmlContent;
        typingIndicator.style.color = colorStyle;
    } else {
        typingIndicator = document.createElement('div');
        typingIndicator.id = 'typing_indicator';
        typingIndicator.classList.add('typing_indicator');
        typingIndicator.style.color = colorStyle;
        typingIndicator.innerHTML = htmlContent;

        const chat = document.getElementById('chat');
        if (chat) {
            const wasChatScrolledDown = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 5;
            chat.appendChild(typingIndicator);
            if (wasChatScrolledDown) {
                chat.scrollTop = chat.scrollHeight;
            }
        }
    }
}

/**
 * 隐藏打字指示器。
 */
function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typing_indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

(function () {
    injectGlobalStyles();
    
    const settings = getSettings();
    addExtensionSettings(settings);

    const charName = name2;
    const binding = charName ? settings.characterBindings[charName] : undefined;
    const activeThemeName = binding?.activeTheme || settings.activeTheme;
    const activeTheme = settings.themes[activeThemeName];
    if (activeTheme) {
        applyCss(activeTheme.css);
    }

    const showIndicatorEvents = [ event_types.GENERATION_AFTER_COMMANDS ];
    const hideIndicatorEvents = [ event_types.GENERATION_STOPPED, event_types.GENERATION_ENDED, event_types.CHAT_CHANGED ];

    showIndicatorEvents.forEach(e => eventSource.on(e, showTypingIndicator));
    hideIndicatorEvents.forEach(e => eventSource.on(e, hideTypingIndicator));
    
    eventSource.on(event_types.CHAT_CHANGED, () => {
        setTimeout(() => {
            const indicator = document.getElementById('typing_indicator');
            if (indicator) {
                showTypingIndicator('refresh', null, false);
            }
            const settingsContainer = document.getElementById('typing_indicator_container');
            if (settingsContainer) {
                 settingsContainer.innerHTML = '';
                 addExtensionSettings(getSettings());
            }
        }, 100);
    });

})();