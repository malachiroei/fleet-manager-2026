# Vercel: Production vs Dev projects

## מניפסט גרסה

- **טסט / dev:** הקובץ הסטטי הוא **`/v-dev-only.json`** בלבד (ב־`public/`). אין **`v.json`** ב-repo.
- **ייצור (`fleet-manager-pro.com`):** בקשה ל־**`/v.json`** מנותבת ל־Edge Function ומחזירה **404** (אין קובץ סטטי בשם הזה).

## בדיקה ידנית

1. פרויקט **Pro** ב-Vercel: אל תשכפלו env מ־**dev** בלי סינון.
2. `https://fleet-manager-pro.com/v.json` וגם **`/v-dev-only.json`** → **404** מה-edge (`/api/block-v-json`).
3. `https://fleet-manager-dev.vercel.app/v-dev-only.json` → **200** (מניפסט טסט).
