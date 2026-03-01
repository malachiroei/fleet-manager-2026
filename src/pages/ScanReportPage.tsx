import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Camera, CheckCircle2, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ScanReportPage() {
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScanning(true);
    
    // סימולציה של ניתוח AI
    setTimeout(() => {
      setResult({
        carNumber: "12-345-67",
        amount: "250 ₪",
        type: "דו\"ח חניה"
      });
      setIsScanning(false);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-background p-6 flex flex-col items-center gap-6">
      <div className="w-full flex justify-between items-center">
        <h2 className="text-xl font-bold">סריקת דוח</h2>
        <Link to="/"><Button variant="ghost">ביטול</Button></Link>
      </div>
      
      {!result ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <input 
            type="file" 
            accept="image/*" 
            capture="environment" 
            onChange={handleCapture}
            id="camera-input"
            className="hidden"
          />
          <label htmlFor="camera-input" className="cursor-pointer">
            <div className="w-40 h-40 rounded-full bg-orange-100 flex items-center justify-center border-4 border-dashed border-orange-500 hover:bg-orange-200 transition-colors">
              {isScanning ? <Loader2 className="h-16 w-16 text-orange-600 animate-spin" /> : <Camera className="h-16 w-16 text-orange-600" />}
            </div>
          </label>
          <p className="font-medium text-lg">{isScanning ? "מנתח נתונים..." : "לחץ לצילום הדו\"ח"}</p>
        </div>
      ) : (
        <div className="w-full max-w-md bg-card border rounded-xl p-6 shadow-lg animate-in zoom-in-95">
          <div className="flex items-center gap-2 text-green-600 font-bold mb-4 border-b pb-2">
            <CheckCircle2 className="h-6 w-6" />
            הנתונים נקלטו!
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="carNumber">מספר רכב</Label>
              <Input
                id="carNumber"
                value={result.carNumber}
                onChange={(e) => setResult({ ...result, carNumber: e.target.value })}
                className="font-mono text-lg"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">סכום לתשלום</Label>
              <Input
                id="amount"
                value={result.amount}
                onChange={(e) => setResult({ ...result, amount: e.target.value })}
                className="text-lg"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">סוג עבירה</Label>
              <Input
                id="type"
                value={result.type}
                onChange={(e) => setResult({ ...result, type: e.target.value })}
                className="text-lg"
              />
            </div>
          </div>
          <Button className="w-full mt-6 bg-green-600 hover:bg-green-700">שמור דוח במערכת</Button>
          <Button variant="outline" onClick={() => setResult(null)} className="w-full mt-2">סריקה חוזרת</Button>
        </div>
      )}
    </div>
  );
}