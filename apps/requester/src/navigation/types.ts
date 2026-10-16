import type { NavigatorScreenParams } from "@react-navigation/native";

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

export type TabParamList = {
  Home: undefined;
  Wallet: undefined;
  Profile: undefined;
};

export type MainStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  CreateErrand: { errandId?: string } | undefined;
  ErrandDetail: { errandId: string };
  ErrandTracking: { errandId: string };
  Chat: { errandId: string };
  RecurringErrands: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};
