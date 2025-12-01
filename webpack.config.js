const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const webpack = require('webpack');
const dotenv = require('dotenv');
const env = dotenv.config().parsed;
console.log('Loaded .env variables:', env);
const envKeys = Object.keys(env).reduce((prev, next) => {
  prev[`process.env.${next}`] = JSON.stringify(env[next]);
  return prev;
}, {});
// Try to read style-config.json at build time so we can bake custom styles into the bundle
let styleConfigDefine = { STYLE_CONFIG: 'undefined' };
try {
  const scPath = path.join(__dirname, 'public', 'style-config.json');
  if (require('fs').existsSync(scPath)) {
    const sc = require(scPath);
    styleConfigDefine = { STYLE_CONFIG: JSON.stringify(sc) };
    console.log('✓ Injecting style-config.json into bundle (STYLE_CONFIG).');
  } else {
    console.log('ℹ️ No style-config.json found at build-time; STYLE_CONFIG will be undefined.');
  }
} catch (err) {
  console.warn('Failed reading style-config.json for DefinePlugin:', err.message);
}
module.exports = {
  entry: './public/app.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    clean: true,
  },
  resolve: {
  fallback: {
    process: require.resolve('process/browser'),
  }
},
  module: {
    rules: [
      {
        test: /\.css$/i,
        use:[MiniCssExtractPlugin.loader, 'css-loader'],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
  template: './public/index.html',
  filename: 'index.html',
  inject: 'body', // ensures CSS/JS are injected
})
, new webpack.DefinePlugin(Object.assign({}, envKeys, styleConfigDefine)),
     new webpack.ProvidePlugin({
    process: 'process/browser',
  }),
   new MiniCssExtractPlugin({
      filename: 'styles.css',
    }),
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, 'public'),
    },
    compress: true,
    setupMiddlewares: (middlewares, devServer) => {
      devServer.app.use((req, res, next) => {
        if (req.path === '/style-config.json') {
          try {
            const fs = require('fs');
            const configPath = path.join(__dirname, 'public', 'style-config.json');
            if (fs.existsSync(configPath)) {
              const config = fs.readFileSync(configPath, 'utf8');
              res.setHeader('Content-Type', 'application/json');
              res.send(config);
              return;
            }
          } catch (err) {
            console.warn('Failed to load style-config.json:', err);
          }
        }
        next();
      });
      return middlewares;
    },
    port: 3000,
    hot: true,
  },
  mode: 'development',
};



