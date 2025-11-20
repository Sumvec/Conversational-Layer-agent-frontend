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
, new webpack.DefinePlugin(envKeys),
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
    port: 8000,
    hot: true,
  },
  mode: 'development',
};



