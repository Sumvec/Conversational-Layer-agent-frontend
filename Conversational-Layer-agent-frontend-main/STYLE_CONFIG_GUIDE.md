# 🎨 Chat UI Comprehensive Style Configuration

## Quick Start

```bash
npm run dev:frontend
```

Interactive CLI guides you through custom styling. Press Enter for defaults, or type your values.

## All Customizable Properties

### 🎨 Colors (8 properties)
| Property | Controls | Example | Default |
|----------|----------|---------|---------|
| **primaryColor** | Buttons, links, gradients, accents | `#667eea` | `#667eea` |
| **secondaryColor** | Gradient partner color | `#764ba2` | `#764ba2` |
| **textColor** | Main text in messages | `#333` | `#333` |
| **textColorLight** | Timestamps, muted text | `#6b7280` | `#6b7280` |
| **backgroundColor** | Chat window, cards | `#ffffff` | `#ffffff` |
| **backgroundColorLight** | Messages area | `#f8fafc` | `#f8fafc` |
| **borderColor** | All borders | `#e1e5e9` | `#e1e5e9` |
| **inputBackground** | Input field | `#f3f4f6` | `#f3f4f6` |

### 📏 Sizing & Spacing (7 properties)
| Property | Controls | Example | Default |
|----------|----------|---------|---------|
| **borderRadius** | Message bubbles, window | `18px` | `18px` |
| **borderRadiusSmall** | Buttons, cards, small elements | `6px` | `6px` |
| **fontSize** | Base text size | `14px` | `14px` |
| **fontSizeLarge** | Headers, titles | `18px` | `18px` |
| **fontSizeSmall** | Timestamps | `12px` | `12px` |
| **padding** | Main spacing | `20px` | `20px` |
| **chatBubbleSize** | Chat button size | `60px` | `60px` |

### ✨ Effects & Transitions (3 properties)
| Property | Controls | Example |
|----------|----------|---------|
| **shadowMedium** | Hover effects | `0 4px 20px rgba(102, 126, 234, 0.4)` |
| **shadowLarge** | Window & elements | `0 10px 40px rgba(0, 0, 0, 0.15)` |
| **transitionSpeed** | Animation speed | `0.3s` |

## Applied Everywhere ✅

- Chat bubble button & header
- Message bubbles (user & assistant)
- Input field & send button
- Product cards & links
- All text, borders, shadows
- All spacing & animations
- Close button & indicators
- Typing animations

## Theme Examples

### Professional Blue
```
Primary: #2563eb
Secondary: #1e40af
Text: #1e293b
Border: #cbd5e1
BG: #ffffff
Border Radius: 12px
Font: 15px
```

### Modern Purple
```
Primary: #7c3aed
Secondary: #6d28d9
Text: #1e293b
Border: #e2e8f0
BG: #fafafa
Border Radius: 16px
Font: 14px
```

### Minimal Clean
```
Primary: #0ea5e9
Secondary: #0284c7
Text: #0f172a
Border: #e2e8f0
BG: #ffffff
Border Radius: 8px
Font: 13px
```

## File Locations

- **Config File**: `public/style-config.json`
- **CLI Script**: `scripts/generate-style-config.js`
- **Applied In**: `public/app.js` (dynamic CSS injection)

## Storage

- File: `public/style-config.json`
- Browser: localStorage `cb_style_config`

## Reset to Defaults

```bash
rm public/style-config.json
npm run dev:frontend
# Press Enter on all prompts
```

## Format Support

**Colors**: `#667eea`, `rgb(102, 126, 234)`, `rgba(102, 126, 234, 0.4)`, named colors

**Sizes**: `18px`, `60px`, percentages

**Shadows**: `0 4px 20px rgba(102, 126, 234, 0.4)`

**Transitions**: `0.3s`, `300ms`

## Tips

✅ Use consistent color palettes  
✅ Keep transitions smooth (0.2s - 0.4s)  
✅ Proportional border radius values  
✅ Commit configs to version control  

❌ Avoid conflicting colors  
❌ Don't use very fast transitions  
❌ Extreme shadow values  

## Troubleshooting

**Q: Styles not showing?**
- Hard refresh: Ctrl+Shift+R or Cmd+Shift+R
- Check `public/style-config.json` exists
- Clear localStorage: `localStorage.removeItem('cb_style_config')`

**Q: How to use in production?**
- Run `npm run dev:frontend` to configure
- Commit `public/style-config.json`
- Run `npm run build`
- Deploy - config is included

## Production Deployment

1. Configure theme locally
2. Commit `public/style-config.json`
3. Run `npm run build`
4. Deploy - themes auto-apply
