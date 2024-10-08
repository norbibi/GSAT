const path = require('path');
const rules = require('./webpack.rules');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const assets = ['img'];

rules.push({
  test: /\.css$/,
  use: [{ loader: 'style-loader' }, { loader: 'css-loader' }],
});

module.exports = {
  module: {
    rules,
  },
  plugins: assets.map(asset => {
    return new CopyWebpackPlugin({
      patterns: [
        { from: path.resolve(__dirname, 'src', asset), to: path.resolve(__dirname, '.webpack/renderer', asset) },
      ],  
    });
  })
};
