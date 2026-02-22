#include "Core/Utils.as"
#include "Core/Utils.as"

import void Ping() from "Companion";
import void Ping() from "Companion";

int Demo(string byValueParam, int unusedParam, int usedParam) {
  // TODO remove before release
  auto inferred = 1;
  int unusedLocal = 0;
  int deadStore = 1;
  deadStore = 2;
  deadStore = 3;
  int constCandidate = usedParam + 1;
  int trunc = 1.25;
  trunc = 2.5;
  MyType@ handle = cast<MyType@>(GetObj());
  if (usedParam > 0) ;
  try {
    Ping();
  } catch {
  }
  print(byValueParam);

  int shadow = 0;
  if (true) {
    int shadow = 2;
    constCandidate = shadow;
  }

  return trunc;
  int unreachable = 42;
}
