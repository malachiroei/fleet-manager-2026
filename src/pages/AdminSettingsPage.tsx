 import { Link } from 'react-router-dom';
 import { Button } from '@/components/ui/button';
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import PricingDataUploader from '@/components/PricingDataUploader';
import FleetDataImporter from '@/components/FleetDataImporter';
import { ArrowRight, Settings, Shield } from 'lucide-react';
 
export default function AdminSettingsPage() {
    const lastPricingUpload = localStorage.getItem('last_pricing_upload');
    const lastVehicleUpload = localStorage.getItem('last_vehicle_upload');
    const lastDriverUpload = localStorage.getItem('last_driver_upload');

    const formatDate = (iso: string | null) => {
      if (!iso) return 'לא בוצעה';
      return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };
 
   return (
     <div className="min-h-screen bg-background">
       <header className="bg-card border-b border-border sticky top-0 z-10">
         <div className="container py-4">
           <div className="flex items-center gap-3">
             <Link to="/">
               <Button variant="ghost" size="icon">
                 <ArrowRight className="h-5 w-5" />
               </Button>
             </Link>
             <div className="flex items-center gap-2">
               <Settings className="h-5 w-5" />
               <h1 className="font-bold text-xl">הגדרות מנהל</h1>
             </div>
           </div>
         </div>
       </header>
 
       <main className="container py-6 space-y-6">
         {/* Pricing Data Uploader */}
          <PricingDataUploader />

          {/* Fleet Data Importer */}
          <FleetDataImporter />

          {/* System Info */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                  <Shield className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <CardTitle>מידע מערכת</CardTitle>
                  <CardDescription>Fleet Manager Pro — גרסה 2</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">טעינת קובץ משרד התחבורה אחרונה:</span>
                  <span className="font-medium">{formatDate(lastPricingUpload)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">טעינת רכבים אחרונה:</span>
                  <span className="font-medium">{formatDate(lastVehicleUpload)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">טעינת נהגים אחרונה:</span>
                  <span className="font-medium">{formatDate(lastDriverUpload)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
       </main>
     </div>
   );
 }