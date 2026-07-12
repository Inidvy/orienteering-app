module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // reanimated plugin must be last
    plugins: ["react-native-worklets/plugin"],
  };
};
