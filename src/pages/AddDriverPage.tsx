import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCreateDriver } from '@/hooks/useDrivers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ArrowRight,
  Loader2,
  User,
  CreditCard,
  FileText,
  Upload,
  Heart,
  Briefcase,
  MapPin,
  FolderOpen,
  X,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';

// Helper to upload file via API and return the path
const uploadFile = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) throw new Error('File upload failed');
  const data = await res.json();
  return data.path;
};

function DocumentUploadBox({
  id,
  label,
  icon: Icon,
  isWide = false,
  description,
  onFileSelect
}: {
  id: string;
  label: string;
  icon: React.ElementType;
  isWide?: boolean;
  description?: string;
  onFileSelect: (file: File | null) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      onFileSelect(selectedFile);
      if (selectedFile.type.startsWith('image/')) {
        const url = URL.createObjectURL(selectedFile);
        setPreview(url);
      } else {
        setPreview(null);
      }
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFile(null);
    onFileSelect(null);
    if (preview) {
      URL.revokeObjectURL(preview);
      setPreview(null);
    }
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div
      className={`border-2 border-dashed border-border rounded-lg p-3 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-muted/50 transition-colors relative group ${isWide ? 'p-6' : 'aspect-square'}`}
      onClick={() => inputRef.current?.click()}
    >
      <input
        type="file"
        id={id}
        name={id}
        ref={inputRef}
        className="hidden"
        onChange={handleFileChange}
        accept="image/*,application/pdf"
      />

      {file ? (
        <>
          <div className="absolute top-2 right-2 z-10">
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={handleRemove}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>

          {preview ? (
            <div className="w-full h-full flex items-center justify-center overflow-hidden rounded-md">
              <img src={preview} alt="Preview" className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <FileText className="h-8 w-8 text-primary mb-2" />
              <span className="text-xs font-medium truncate max-w-[120px]">{file.name}</span>
            </div>
          )}
          {isWide && preview && (
            <span className="text-xs font-medium mt-2">{file.name}</span>
          )}
        </>
      ) : (
        <>
          <Icon className={`${isWide ? 'h-10 w-10' : 'h-6 w-6'} text-muted-foreground mb-2`} />
          <span className={`${isWide ? 'text-sm' : 'text-xs'} font-medium`}>{label}</span>
          {description && (
            <span className="text-xs text-muted-foreground mt-1 max-w-sm">{description}</span>
          )}
        </>
      )}
    </div>
  );
}

export default function AddDriverPage() {
  const navigate = useNavigate();
  const createDriver = useCreateDriver();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // File states
  const [licenseFront, setLicenseFront] = useState<File | null>(null);
  const [licenseBack, setLicenseBack] = useState<File | null>(null);
  const [healthDeclaration, setHealthDeclaration] = useState<File | null>(null);
  const [additionalDoc, setAdditionalDoc] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const formData = new FormData(e.currentTarget);

      // Upload files via API
      let licenseFrontUrl = null;
      let licenseBackUrl = null;
      let healthDeclarationUrl = null;
      let additionalDocUrl = null;

      if (licenseFront) licenseFrontUrl = await uploadFile(licenseFront);
      if (licenseBack) licenseBackUrl = await uploadFile(licenseBack);
      if (healthDeclaration) healthDeclarationUrl = await uploadFile(healthDeclaration);
      if (additionalDoc) additionalDocUrl = await uploadFile(additionalDoc);

      const documents = [];
      if (additionalDocUrl) {
        documents.push({
          id: crypto.randomUUID(),
          // driver_id will be handled by the backend or we use a placeholder
          // since strict relational integrity isn't enforced in the JSON logic yet.
          // Ideally useCreateDriver should inject the ID, but for now we create the object structure.
          driver_id: '', // Placeholder, will be populated on creation if needed or ignored
          title: 'Additional Document',
          file_url: additionalDocUrl,
          created_at: new Date().toISOString()
        });
      }

      await createDriver.mutateAsync({
        full_name: formData.get('full_name') as string,
        id_number: formData.get('id_number') as string,
        license_expiry: formData.get('license_expiry') as string,
        // Optional fields
        user_id: null,
        phone: formData.get('phone') as string || null,
        email: formData.get('email') as string || null,
        health_declaration_date: formData.get('health_declaration_date') as string || null,
        safety_training_date: formData.get('safety_training_date') as string || null,
        // New fields
        address: formData.get('address') as string || null,
        job_title: formData.get('job_title') as string || null,
        department: formData.get('department') as string || null,
        license_number: formData.get('license_number') as string || null,
        regulation_585b_date: formData.get('regulation_585b_date') as string || null,
        // Document URLs (Server Paths)
        license_front_url: licenseFrontUrl,
        license_back_url: licenseBackUrl,
        health_declaration_url: healthDeclarationUrl,
        documents: documents
      });

      toast.success('הנהג נוסף בהצלחה');
      navigate('/drivers');
    } catch (error) {
      toast.error('שגיאה בהוספת הנהג');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center gap-3">
            <Link to="/drivers">
              <Button variant="ghost" size="icon">
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
            <h1 className="font-bold text-xl">הוספת נהג חדש</h1>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Personal Info */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10">
                  <User className="h-5 w-5 text-accent" />
                </div>
                <CardTitle>פרטים אישיים</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="full_name">שם מלא *</Label>
                  <Input
                    id="full_name"
                    name="full_name"
                    placeholder="ישראל ישראלי"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="id_number">תעודת זהות *</Label>
                  <Input
                    id="id_number"
                    name="id_number"
                    placeholder="123456789"
                    required
                    dir="ltr"
                  />
                </div>

                <div>
                  <Label htmlFor="phone">טלפון</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    placeholder="050-1234567"
                    dir="ltr"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="email">אימייל</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="driver@example.com"
                    dir="ltr"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="address">כתובת מגורים</Label>
                  <Input
                    id="address"
                    name="address"
                    placeholder="רחוב, עיר"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Professional Info */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Briefcase className="h-5 w-5 text-primary" />
                </div>
                <CardTitle>מידע מקצועי</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="job_title">תפקיד</Label>
                  <Input
                    id="job_title"
                    name="job_title"
                    placeholder="נהג משאית"
                  />
                </div>

                <div>
                  <Label htmlFor="department">מחלקה</Label>
                  <Input
                    id="department"
                    name="department"
                    placeholder="לוגיסטיקה"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* License & Compliance */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                  <CreditCard className="h-5 w-5 text-amber-600" />
                </div>
                <CardTitle>רישיון ותאימות</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="license_number">מספר רישיון נהיגה</Label>
                  <Input
                    id="license_number"
                    name="license_number"
                    placeholder="12345678"
                    dir="ltr"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="license_expiry">תוקף רישיון נהיגה *</Label>
                  <Input
                    id="license_expiry"
                    name="license_expiry"
                    type="date"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="health_declaration_date">תאריך הצהרת בריאות</Label>
                  <Input
                    id="health_declaration_date"
                    name="health_declaration_date"
                    type="date"
                  />
                </div>

                <div>
                  <Label htmlFor="safety_training_date">תאריך הדרכת בטיחות</Label>
                  <Input
                    id="safety_training_date"
                    name="safety_training_date"
                    type="date"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="regulation_585b_date">תאריך בדיקת תקנה 585ב'</Label>
                  <Input
                    id="regulation_585b_date"
                    name="regulation_585b_date"
                    type="date"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Document Uploads */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                </div>
                <CardTitle>סריקות רישיון</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <DocumentUploadBox
                  id="license_front"
                  label="רישיון - חזית"
                  icon={Upload}
                  onFileSelect={setLicenseFront}
                />
                <DocumentUploadBox
                  id="license_back"
                  label="רישיון - גב"
                  icon={Upload}
                  onFileSelect={setLicenseBack}
                />
                <DocumentUploadBox
                  id="health_declaration"
                  label="הצהרת בריאות"
                  icon={Heart}
                  onFileSelect={setHealthDeclaration}
                />
              </div>
            </CardContent>
          </Card>

          {/* General Documents Folder */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                  <FolderOpen className="h-5 w-5 text-purple-600" />
                </div>
                <CardTitle>תיקיית מסמכים</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <DocumentUploadBox
                id="other_docs"
                label="העלאת מסמכים נוספים"
                icon={FolderOpen}
                isWide
                description="ניתן להעלות קבצים נוספים כאן (PDF, תמונות, מסמכים)"
                onFileSelect={setAdditionalDoc}
              />
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex gap-3">
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              שמור נהג
            </Button>
            <Link to="/drivers" className="flex-1">
              <Button type="button" variant="outline" className="w-full">
                ביטול
              </Button>
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
