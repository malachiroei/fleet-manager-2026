/**
 * פרסום גרסה מלא — הקריאה ל־Edge Function מתבצעת ב־`invokePublishVersionSnapshot`
 * עם `body: { snapshot }` כולל `snapshot.features` מהמודאל (`PublishVersionDetailedDialog`).
 *
 * JWT ב־`Authorization` + `apikey` של הפרויקט.
 */
export {
  invokePublishVersionSnapshot,
  type PublishVersionSnapshotResponse,
} from '@/lib/invokePublishVersionSnapshot';
