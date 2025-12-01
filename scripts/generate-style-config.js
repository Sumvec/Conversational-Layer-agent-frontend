#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Default styling config - comprehensive
const defaultConfig = {
  // Colors
  primaryColor: '#667eea',
  secondaryColor: '#764ba2',
  textColor: '#333',
  textColorLight: '#6b7280',
  backgroundColor: '#ffffff',
  backgroundColorLight: '#f8fafc',
  borderColor: '#e1e5e9',
  userMessageBg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  userMessageColor: '#ffffff',
  assistantMessageBg: '#ffffff',
  assistantMessageColor: '#333',
  inputBackground: '#f3f4f6',
  
  // Sizes & Spacing
  borderRadius: '18px',
  borderRadiusSmall: '6px',
  fontSize: '14px',
  fontSizeLarge: '18px',
  fontSizeSmall: '12px',
  padding: '20px',
  paddingSmall: '12px',
  
  // Chat Bubble
  chatBubbleSize: '60px',
  chatBubbleBorderRadius: '50%',
  
  // Header
  headerBackground: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  headerColor: '#ffffff',
  headerPadding: '20px',
  
  // Messages
  messageRadius: '18px',
  messagePadding: '12px 16px',
  messageBorderWidth: '1px',
  
  // Input
  inputBorderRadius: '26px',
  inputPadding: '12px 18px',
  inputFontSize: '15px',
  
  // Buttons
  buttonRadius: '50%',
  buttonSize: '40px',
  
  // Shadows
  shadowSmall: '0 2px 6px rgba(16, 24, 40, 0.03)',
  shadowMedium: '0 4px 20px rgba(102, 126, 234, 0.4)',
  shadowLarge: '0 10px 40px rgba(0, 0, 0, 0.15)',
  
  // Transitions
  transitionSpeed: '0.3s',
};

// Questions for user input
const questions = [
  {
    category: '🎨 Colors',
    items: [
      {
        key: 'primaryColor',
        prompt: 'Enter primary color (e.g., #667eea): ',
        default: defaultConfig.primaryColor,
      },
      {
        key: 'secondaryColor',
        prompt: 'Enter secondary color (e.g., #764ba2): ',
        default: defaultConfig.secondaryColor,
      },
      {
        key: 'textColor',
        prompt: 'Enter text color (e.g., #333): ',
        default: defaultConfig.textColor,
      },
      {
        key: 'borderColor',
        prompt: 'Enter border color (e.g., #e1e5e9): ',
        default: defaultConfig.borderColor,
      },
      {
        key: 'backgroundColor',
        prompt: 'Enter background color (e.g., #ffffff): ',
        default: defaultConfig.backgroundColor,
      },
      {
        key: 'inputBackground',
        prompt: 'Enter input background color (e.g., #f3f4f6): ',
        default: defaultConfig.inputBackground,
      },
      {
        key: 'headerBackground',
        prompt: 'Enter header background color/gradient (e.g., linear-gradient(135deg, #667eea 0%, #764ba2 100%)): ',
        default: defaultConfig.headerBackground,
      },
      {
        key: 'headerColor',
        prompt: 'Enter header text color (e.g., #ffffff): ',
        default: defaultConfig.headerColor,
      },
      {
        key: 'userMessageBg',
        prompt: 'Enter your chat bubble color/gradient (e.g., linear-gradient(135deg, #667eea 0%, #764ba2 100%)): ',
        default: defaultConfig.userMessageBg,
      },
      {
        key: 'userMessageColor',
        prompt: 'Enter your chat bubble text color (e.g., #ffffff): ',
        default: defaultConfig.userMessageColor,
      },
    ],
  },
  {
    category: '📏 Sizing & Spacing',
    items: [
      {
        key: 'borderRadius',
        prompt: 'Enter main border radius (e.g., 18px): ',
        default: defaultConfig.borderRadius,
      },
      {
        key: 'borderRadiusSmall',
        prompt: 'Enter small border radius (e.g., 6px): ',
        default: defaultConfig.borderRadiusSmall,
      },
      {
        key: 'fontSize',
        prompt: 'Enter base font size (e.g., 14px): ',
        default: defaultConfig.fontSize,
      },
      {
        key: 'fontSizeLarge',
        prompt: 'Enter large font size (e.g., 18px): ',
        default: defaultConfig.fontSizeLarge,
      },
      {
        key: 'padding',
        prompt: 'Enter main padding (e.g., 20px): ',
        default: defaultConfig.padding,
      },
      {
        key: 'chatBubbleSize',
        prompt: 'Enter chat bubble size (e.g., 60px): ',
        default: defaultConfig.chatBubbleSize,
      },
    ],
  },
  {
    category: '✨ Effects & Transitions',
    items: [
      {
        key: 'shadowMedium',
        prompt: 'Enter medium shadow (e.g., 0 4px 20px rgba(102, 126, 234, 0.4)): ',
        default: defaultConfig.shadowMedium,
      },
      {
        key: 'shadowLarge',
        prompt: 'Enter large shadow (e.g., 0 10px 40px rgba(0, 0, 0, 0.15)): ',
        default: defaultConfig.shadowLarge,
      },
      {
        key: 'transitionSpeed',
        prompt: 'Enter transition speed (e.g., 0.3s): ',
        default: defaultConfig.transitionSpeed,
      },
    ],
  },
];

async function promptUser(question) {
  return new Promise((resolve) => {
    rl.question(question.prompt, (answer) => {
      const value = answer.trim() || question.default;
      resolve(value);
    });
  });
}

async function promptYesNo(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      const value = answer.trim().toLowerCase();
      resolve(value === 'yes' || value === 'y');
    });
  });
}

async function generateConfig() {
  console.log('\n🎨 Advanced Chat UI Style Configuration\n');
  console.log('This tool will customize all aspects of your chat UI.');
  console.log('Press Enter to use default values.\n');
  console.log('═'.repeat(60) + '\n');

  const config = { ...defaultConfig };

  // Ask if user wants to customize chat bubbles and header
  console.log('\n💬 Optional: Customize Chat Bubbles & Header?');
  console.log('─'.repeat(40));
  const customizeChatBubbles = await promptYesNo(
    'Do you want to customize your chat bubble colors and header? (yes/no, default: no): '
  );

  // Debug: show parsed response
  console.log('\nDEBUG: parsed customizeChatBubbles =>', customizeChatBubbles);

  const bubbleKeys = ['headerBackground', 'headerColor', 'userMessageBg', 'userMessageColor'];

  // If user does NOT want to customize chat bubbles, REMOVE those questions
  if (!customizeChatBubbles) {
    console.log('\nSkipping chat bubble & header customization (using defaults).');
    for (const cat of questions) {
      if (cat.category === '🎨 Colors') {
        cat.items = cat.items.filter((q) => !bubbleKeys.includes(q.key));
        break;
      }
    }
  } else {
    console.log('\nChat bubble & header customization: ENABLED.');
  }

  // If customizeChatBubbles is false, skip all prompts and use defaults
  if (!customizeChatBubbles) {
    console.log('\nSkipping all customization questions (using all defaults).');
    for (const category of questions) {
      if (!category.items || category.items.length === 0) continue;
      for (const q of category.items) {
        config[q.key] = q.default;
      }
    }
  } else {
    // Ask all questions interactively
    for (const category of questions) {
      if (!category.items || category.items.length === 0) continue;
      console.log(`\n${category.category}`);
      console.log('─'.repeat(40));
      for (const q of category.items) {
        config[q.key] = await promptUser(q);
      }
    }
  }

  rl.close();

  const configPath = path.join(__dirname, '..', 'public', 'style-config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  console.log('\n' + '═'.repeat(60));
  console.log('✅ Style configuration saved to public/style-config.json\n');

  if (customizeChatBubbles) {
    console.log('💬 Chat Bubble & Header Customization: ✅ ENABLED');
  } else {
    console.log('💬 Chat Bubble & Header Customization: ⏭️  SKIPPED (using defaults)');
  }

  console.log('\nConfiguration Summary:');
  console.log('─'.repeat(40));
  Object.entries(config).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
  });
  console.log('\n');
}


generateConfig().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
