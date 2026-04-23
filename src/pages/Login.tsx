import { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { api } from "../lib/api";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const { login, signup } = useAuthStore();
  
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotSubmitted, setForgotSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return alert('Please enter both email and password.');
    setLoading(true);
    try {
      if (isSignUp) {
        await signup({ email, password, name: `${firstName} ${lastName}`.trim(), phone });
      } else {
        await login(email, password);
      }
    } catch (error: any) {
      console.error('Authentication Error', error);
      const msg = error?.code || error?.message || "request_failed";
      alert(`Authentication failed: ${msg}.`);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!forgotEmail) return alert("Please enter your email address.");
    setForgotSending(true);
    try {
      await api("/api/auth/password-reset/request", {
        method: "POST",
        body: JSON.stringify({ email: forgotEmail }),
      });
      setForgotSubmitted(true);
    } catch (error: any) {
      console.error("Forgot Password Error", error);
      alert(`Request failed: ${error.message}.`);
    } finally {
      setForgotSending(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 font-sans">
      <div
        className="bg-slate-900 text-white px-6 py-12 sm:px-12 lg:px-16 flex relative bg-cover bg-center"
        style={{
          backgroundImage:
            'linear-gradient(135deg, rgba(2, 6, 23, 0.58), rgba(15, 23, 42, 0.86)), url("https://images.unsplash.com/photo-1759210358926-4673cc44d35f?auto=format&fit=crop&w=1600&q=80")',
        }}
      >
        <div className="w-full max-w-xl mx-auto flex flex-col justify-center relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center font-bold text-white text-2xl shadow-md">
              M
            </div>
            <div>
              <div className="text-2xl font-black tracking-tight">DataConnect</div>
              <div className="text-xs font-bold uppercase tracking-widest text-slate-300">Mobile Data Manager</div>
            </div>
          </div>

          <div className="mt-10 grid gap-3 text-sm text-slate-200">
            <div className="flex gap-3">
              <div className="w-2 h-2 rounded-full bg-indigo-400 mt-2" />
              <div className="font-bold text-white">Databundles</div>
            </div>
            <div className="flex gap-3">
              <div className="w-2 h-2 rounded-full bg-indigo-400 mt-2" />
              <div className="font-bold text-white">LTE and 5G Services</div>
            </div>
            <div className="flex gap-3">
              <div className="w-2 h-2 rounded-full bg-indigo-400 mt-2" />
              <div className="font-bold text-white">Coverage Checks</div>
            </div>
          </div>

          <div className="mt-10 text-sm text-slate-300">Reseller access comming soon!</div>
        </div>

        <div className="absolute bottom-6 left-6 sm:left-12 lg:left-16 text-left text-xs text-slate-400 space-y-1 z-10">
          <div>© {new Date().getFullYear()} DataConnect. All rights reserved.</div>
          <div>
            Developed by{" "}
            <a
              href="https://website365.co.za"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-300 hover:text-white underline underline-offset-2"
            >
              Website365
            </a>
          </div>
        </div>
      </div>

      <div className="bg-slate-50 px-6 py-12 sm:px-12 lg:px-16 flex relative">
        <div className="w-full max-w-md mx-auto flex flex-col justify-center">
          <div className="glass-card py-8 px-4 sm:px-10 space-y-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <h3 className="text-lg font-bold text-slate-800 text-center mb-4">
                {isSignUp ? 'Create an Account' : 'Sign in to Your Account'}
              </h3>
            
            {isSignUp && (
               <>
                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <Label htmlFor="firstName" className="text-slate-700">First Name</Label>
                     <Input 
                       id="firstName" 
                       value={firstName} 
                       onChange={(e) => setFirstName(e.target.value)} 
                       placeholder="John" 
                       className="mt-1"
                       required 
                     />
                   </div>
                   <div>
                     <Label htmlFor="lastName" className="text-slate-700">Last Name</Label>
                     <Input 
                       id="lastName" 
                       value={lastName} 
                       onChange={(e) => setLastName(e.target.value)} 
                       placeholder="Doe" 
                       className="mt-1"
                       required 
                     />
                   </div>
                 </div>
                 <div>
                   <Label htmlFor="phone" className="text-slate-700">Mobile Number</Label>
                   <Input 
                     id="phone" 
                     type="tel"
                     value={phone} 
                     onChange={(e) => setPhone(e.target.value)} 
                     placeholder="+27 82 000 0000" 
                     className="mt-1"
                     required 
                   />
                 </div>
               </>
            )}

            <div>
              <Label htmlFor="email" className="text-slate-700">Email Address</Label>
              <Input 
                id="email" 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                placeholder="you@example.com" 
                className="mt-1"
                required 
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-slate-700">Password</Label>
              <Input 
                id="password" 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="••••••••" 
                className="mt-1"
                required 
                minLength={6}
              />
              {isSignUp && <p className="text-xs text-slate-500 mt-1">Minimum 6 characters long.</p>}
              {!isSignUp && (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                    onClick={() => {
                      setForgotEmail(email);
                      setForgotSubmitted(false);
                      setForgotOpen(true);
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
              )}
            </div>
            <Button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold mt-2"
              size="lg"
              disabled={loading}
            >
              {loading ? 'Processing...' : isSignUp ? 'Sign Up' : 'Sign In'}
            </Button>
            
            <div className="text-center mt-6">
               <p className="text-sm text-slate-600">
                  {isSignUp ? 'Already have an account?' : 'Need an account?'}
                  <button 
                    type="button" 
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="ml-1 font-bold text-indigo-600 hover:text-indigo-800"
                  >
                    {isSignUp ? 'Sign in' : 'Sign up'}
                  </button>
               </p>
            </div>
          </form>
        </div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-center text-xs text-slate-500">
          Web App Developement by{" "}
          <a
            href="https://website365.co.za"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-indigo-600 hover:text-indigo-800 underline underline-offset-2"
          >
            Website365
          </a>
        </div>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forgot Password</DialogTitle>
            <DialogDescription>
              Submit your email address and we’ll record a reset request for support to assist you.
            </DialogDescription>
          </DialogHeader>

          {!forgotSubmitted ? (
            <div className="space-y-3">
              <div>
                <Label htmlFor="forgotEmail" className="text-slate-700">
                  Email Address
                </Label>
                <Input
                  id="forgotEmail"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1"
                  required
                />
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-700">
              If an account exists for this email, the request has been recorded. Please check your inbox or contact support.
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setForgotOpen(false)}>
              Close
            </Button>
            {!forgotSubmitted && (
              <Button type="button" onClick={handleForgotPassword} disabled={forgotSending}>
                {forgotSending ? "Sending..." : "Submit Request"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
