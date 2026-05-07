import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ComplianceTower() {
  return (
    <Card className="border-cyan-400/30 bg-slate-900/50">
      {/* הכותרת מופיעה כבר ב-FleetHudPageShell — לא לשכפל */} 
      <CardHeader className="sr-only">
        <CardTitle>מרכז ציות</CardTitle>
      </CardHeader>
      <CardContent className="text-right text-sm text-muted-foreground">
        רכיב מרכז ציות בטעינה. ניתן להמשיך לעבוד בדף הציות ובינתיים מוצג תקציר התראות מתחת.
      </CardContent>
    </Card>
  );
}
