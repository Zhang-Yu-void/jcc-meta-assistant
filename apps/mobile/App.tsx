import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { Text } from "react-native";
import { MetaProvider } from "./src/context/MetaContext";
import { PickScreen } from "./src/screens/PickScreen";
import { CompsScreen } from "./src/screens/CompsScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";

const Tab = createBottomTabNavigator();

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: "#0f172a",
    card: "#1e293b",
    border: "#334155",
    primary: "#38bdf8",
    text: "#f8fafc",
  },
};

export default function App() {
  return (
    <MetaProvider>
      <NavigationContainer theme={theme}>
        <StatusBar style="light" />
        <Tab.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: "#1e293b" },
            headerTintColor: "#f8fafc",
            tabBarStyle: { backgroundColor: "#1e293b", borderTopColor: "#334155" },
            tabBarActiveTintColor: "#38bdf8",
            tabBarInactiveTintColor: "#94a3b8",
          }}
        >
          <Tab.Screen
            name="Pick"
            component={PickScreen}
            options={{ title: "点选", tabBarLabel: "点选", tabBarIcon: () => <Text>🎯</Text> }}
          />
          <Tab.Screen
            name="Comps"
            component={CompsScreen}
            options={{ title: "阵容库", tabBarLabel: "阵容库", tabBarIcon: () => <Text>📋</Text> }}
          />
          <Tab.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: "设置", tabBarLabel: "设置", tabBarIcon: () => <Text>⚙️</Text> }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </MetaProvider>
  );
}
