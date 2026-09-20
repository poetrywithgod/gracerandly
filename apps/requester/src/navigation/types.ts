export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

export type MainStackParamList = {
  Home: undefined;
  CreateErrand: undefined;
  ErrandTracking: { errandId: string };
  Profile: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};
