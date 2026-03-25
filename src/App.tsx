/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Minus, 
  Search, 
  Filter, 
  AlertCircle, 
  LogOut, 
  Package, 
  LayoutDashboard, 
  ShoppingCart, 
  UserPlus,
  Trash2,
  Edit2,
  ChevronRight,
  ChevronLeft,
  X,
  MapPin
} from 'lucide-react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc,
  serverTimestamp,
  increment
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

// --- Error Boundary ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
          <h2 className="text-2xl font-bold mb-4">Algo salió mal.</h2>
          <Button onClick={() => window.location.reload()} className="bg-pink-600 text-white">
            Recargar Aplicación
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Types ---
interface Product {
  id: string;
  name: string;
  category: string;
  stockActual: number;
  stockMinimo: number;
  location?: string;
  updatedAt?: any;
  updatedBy?: string;
  firebaseId: string;
}

interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'employee';
}

// --- Components ---

const Button = ({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button 
    className={cn(
      "px-4 py-2 rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
      className
    )} 
    {...props} 
  />
);

const Input = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input 
    className={cn(
      "w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all",
      className
    )} 
    {...props} 
  />
);

const Badge = ({ children, className, variant = 'default' }: { children: React.ReactNode, className?: string, variant?: 'default' | 'danger' | 'warning' | 'success' }) => {
  const variants = {
    default: "bg-gray-100 text-gray-700",
    danger: "bg-red-100 text-red-700",
    warning: "bg-amber-100 text-amber-700",
    success: "bg-emerald-100 text-emerald-700"
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold", variants[variant], className)}>
      {children}
    </span>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeTab, setActiveTab] = useState<'inventory' | 'urgent' | 'admin'>('inventory');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [authorizedUsers, setAuthorizedUsers] = useState<UserProfile[]>([]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // Check if user is authorized
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setUserProfile(userDoc.data() as UserProfile);
        } else if (user.email === "cristianmoisesvasquezchavez@gmail.com") {
          // Auto-register the main admin
          const profile: UserProfile = {
            uid: user.uid,
            email: user.email!,
            role: 'admin'
          };
          await setDoc(doc(db, 'users', user.uid), profile);
          setUserProfile(profile);
        } else {
          // Not authorized
          toast.error("Acceso denegado. No estás autorizado.");
          signOut(auth);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Products Listener
  useEffect(() => {
    if (!userProfile) return;

    const q = query(collection(db, 'products'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const productList = snapshot.docs.map(doc => ({
        ...doc.data(),
        firebaseId: doc.id
      })) as Product[];
      setProducts(productList);
    }, (error) => {
      console.error("Firestore Error:", error);
      toast.error("Error al cargar productos.");
    });

    return () => unsubscribe();
  }, [userProfile]);

  // Authorized Users Listener (Admin only)
  useEffect(() => {
    if (userProfile?.role !== 'admin') return;

    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const userList = snapshot.docs.map(doc => doc.data() as UserProfile);
      setAuthorizedUsers(userList);
    });

    return () => unsubscribe();
  }, [userProfile]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login Error:", error);
      toast.error("Error al iniciar sesión.");
    }
  };

  const handleLogout = () => signOut(auth);

  const updateStock = async (firebaseId: string, amount: number) => {
    try {
      const productRef = doc(db, 'products', firebaseId);
      await updateDoc(productRef, {
        stockActual: increment(amount),
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid
      });
      toast.success("Stock actualizado");
    } catch (error) {
      console.error("Update Error:", error);
      toast.error("Error al actualizar stock.");
    }
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            p.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'Todas' || p.category === selectedCategory;
      const isUrgent = activeTab === 'urgent' ? p.stockActual <= p.stockMinimo : true;
      return matchesSearch && matchesCategory && isUrgent;
    });
  }, [products, searchQuery, selectedCategory, activeTab]);

  const categories = useMemo(() => {
    const cats = new Set(products.map(p => p.category));
    return ['Todas', ...Array.from(cats)];
  }, [products]);

  const urgentCount = products.filter(p => p.stockActual <= p.stockMinimo).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="w-12 h-12 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !userProfile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 text-center">
        <div className="w-24 h-24 bg-pink-100 rounded-3xl flex items-center justify-center mb-8 shadow-xl shadow-pink-200">
          <Package className="w-12 h-12 text-pink-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Cosméticos & Fantasía</h1>
        <p className="text-gray-500 mb-8 max-w-xs">Gestiona tu inventario en tiempo real de forma segura.</p>
        <Button 
          onClick={handleLogin}
          className="bg-pink-600 text-white hover:bg-pink-700 px-8 py-3 rounded-2xl shadow-lg shadow-pink-200 flex items-center gap-2"
        >
          Iniciar Sesión con Google
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <Toaster position="top-center" />
      
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-pink-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-pink-200">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900">Inventario</h1>
              <p className="text-xs text-gray-500">{userProfile.role === 'admin' ? 'Administrador' : 'Empleado'}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
          >
            <LogOut className="w-6 h-6" />
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        
        {/* Search and Filters */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input 
              placeholder="Buscar por nombre o código..." 
              className="pl-10 h-12 rounded-2xl border-none shadow-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all",
                  selectedCategory === cat 
                    ? "bg-pink-600 text-white shadow-md shadow-pink-200" 
                    : "bg-white text-gray-600 border border-gray-100"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product List */}
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filteredProducts.length > 0 ? (
              filteredProducts.map((product) => (
                <motion.div
                  key={product.firebaseId}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={cn(
                    "bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between gap-4",
                    product.stockActual <= product.stockMinimo && "border-red-200 bg-red-50/30"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-gray-900 truncate">{product.name}</h3>
                      {product.stockActual <= product.stockMinimo && (
                        <Badge variant="danger">Bajo Stock</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Filter className="w-3 h-3" /> {product.category}
                      </span>
                      <span className="flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Cod: {product.id}
                      </span>
                      {product.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {product.location}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-3 bg-gray-50 p-1 rounded-xl border border-gray-100">
                      <button 
                        onClick={() => updateStock(product.firebaseId, -1)}
                        className="p-1.5 hover:bg-white rounded-lg text-gray-600 shadow-sm transition-all"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className={cn(
                        "font-bold text-lg min-w-[2ch] text-center",
                        product.stockActual <= product.stockMinimo ? "text-red-600" : "text-gray-900"
                      )}>
                        {product.stockActual}
                      </span>
                      <button 
                        onClick={() => updateStock(product.firebaseId, 1)}
                        className="p-1.5 hover:bg-white rounded-lg text-gray-600 shadow-sm transition-all"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                      Mín: {product.stockMinimo}
                    </span>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-12 text-gray-400">
                <Package className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>No se encontraron productos</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Navigation Bar */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl px-6 py-3 flex items-center gap-8 z-40">
        <button 
          onClick={() => setActiveTab('inventory')}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors",
            activeTab === 'inventory' ? "text-pink-600" : "text-gray-400"
          )}
        >
          <LayoutDashboard className="w-6 h-6" />
          <span className="text-[10px] font-bold">Inventario</span>
        </button>
        
        <button 
          onClick={() => setActiveTab('urgent')}
          className={cn(
            "flex flex-col items-center gap-1 transition-colors relative",
            activeTab === 'urgent' ? "text-pink-600" : "text-gray-400"
          )}
        >
          <ShoppingCart className="w-6 h-6" />
          <span className="text-[10px] font-bold">Urgentes</span>
          {urgentCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full font-bold">
              {urgentCount}
            </span>
          )}
        </button>

        {userProfile.role === 'admin' && (
          <button 
            onClick={() => setIsUserModalOpen(true)}
            className={cn(
              "flex flex-col items-center gap-1 transition-colors",
              activeTab === 'admin' ? "text-pink-600" : "text-gray-400"
            )}
          >
            <UserPlus className="w-6 h-6" />
            <span className="text-[10px] font-bold">Usuarios</span>
          </button>
        )}

        {userProfile.role === 'admin' && (
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="w-12 h-12 bg-pink-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-pink-200 active:scale-90 transition-transform"
          >
            <Plus className="w-6 h-6" />
          </button>
        )}
      </nav>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Nuevo Producto</h2>
                <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <form className="space-y-4" onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const newProduct = {
                  id: formData.get('id') as string,
                  name: formData.get('name') as string,
                  category: formData.get('category') as string,
                  stockActual: Number(formData.get('stockActual')),
                  stockMinimo: Number(formData.get('stockMinimo')),
                  location: formData.get('location') as string,
                  updatedAt: serverTimestamp(),
                  updatedBy: user?.uid
                };

                try {
                  await setDoc(doc(collection(db, 'products')), newProduct);
                  toast.success("Producto agregado con éxito");
                  setIsAddModalOpen(false);
                } catch (error) {
                  console.error("Add Error:", error);
                  toast.error("Error al agregar producto");
                }
              }}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase">Código / ID</label>
                    <Input name="id" required placeholder="P001" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase">Categoría</label>
                    <Input name="category" required placeholder="Maquillaje" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Nombre del Producto</label>
                  <Input name="name" required placeholder="Labial Mate Rojo" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase">Stock Inicial</label>
                    <Input name="stockActual" type="number" required defaultValue="0" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-500 uppercase">Stock Mínimo</label>
                    <Input name="stockMinimo" type="number" required defaultValue="5" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Ubicación (Opcional)</label>
                  <Input name="location" placeholder="Pasillo 2, Estante B" />
                </div>

                <Button type="submit" className="w-full bg-pink-600 text-white py-4 rounded-2xl mt-4 shadow-lg shadow-pink-200">
                  Guardar Producto
                </Button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* User Management Modal */}
      <AnimatePresence>
        {isUserModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsUserModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Usuarios Autorizados</h2>
                <button onClick={() => setIsUserModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <form className="space-y-4 mb-8" onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const email = formData.get('email') as string;
                const role = formData.get('role') as 'admin' | 'employee';
                const uid = formData.get('uid') as string;

                if (!uid) {
                  toast.error("Se requiere el UID del usuario (pueden obtenerlo en su perfil)");
                  return;
                }

                try {
                  await setDoc(doc(db, 'users', uid), { uid, email, role });
                  toast.success("Usuario autorizado con éxito");
                  (e.target as HTMLFormElement).reset();
                } catch (error) {
                  console.error("User Add Error:", error);
                  toast.error("Error al autorizar usuario");
                }
              }}>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Email</label>
                  <Input name="email" type="email" required placeholder="empleado@gmail.com" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">UID de Firebase</label>
                  <Input name="uid" required placeholder="UID del usuario" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Rol</label>
                  <select name="role" className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all">
                    <option value="employee">Empleado</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <Button type="submit" className="w-full bg-pink-600 text-white py-3 rounded-xl mt-2">
                  Autorizar Usuario
                </Button>
              </form>

              <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-400 uppercase">Lista de Acceso</h3>
                {authorizedUsers.map(u => (
                  <div key={u.uid} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{u.email}</p>
                      <p className="text-[10px] text-gray-500 uppercase">{u.role}</p>
                    </div>
                    {u.email !== "cristianmoisesvasquezchavez@gmail.com" && (
                      <button 
                        onClick={async () => {
                          if (confirm("¿Eliminar acceso a este usuario?")) {
                            await deleteDoc(doc(db, 'users', u.uid));
                            toast.success("Usuario eliminado");
                          }
                        }}
                        className="p-2 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
