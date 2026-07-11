import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { DEFAULT_TUNING, classOf } from "@orienteering/verification-core";

/*
 * Placeholder shell. Real screens per docs/design.md UI Specification:
 * Home -> Course browse -> Course detail -> RUN -> Finish/Splits,
 * plus My runs and Leaderboards. Run screen is sport-pure: no position dot,
 * compass toggle, manual rotation only.
 */
export default function App() {
  const demoClass = classOf(1990, "M", new Date());
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Orienteering App</Text>
      <Text style={styles.line}>
        verification-core wired: tuning config v{DEFAULT_TUNING.version}
      </Text>
      <Text style={styles.line}>demo class for 1990/M: {demoClass}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  title: { fontSize: 24, fontWeight: "700" },
  line: { fontSize: 16, color: "#141414" },
});
