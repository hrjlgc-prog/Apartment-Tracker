  import React, { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, query, onSnapshot, updateDoc, writeBatch, getDocs, orderBy, enableIndexedDbPersistence } from 'firebase/firestore';
import { Home, List, Loader2, Check, ArrowUp, Archive, ChevronDown, ChevronUp, Search, History, LayoutDashboard, ArrowRight, Printer, Clock } from 'lucide-react';

// ── Firebase Config ──────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyCtKsbB_IMNEaC8aqNDGil_mtDqH0p6I8Q",
  authDomain: "apartment-tracker-153d2.firebaseapp.com",
  projectId: "apartment-tracker-153d2",
  storageBucket: "apartment-tracker-153d2.firebasestorage.app",
  messagingSenderId: "585710850820",
  appId: "1:585710850820:web:6f5143af1235715695b651",
  measurementId: "G-E5QVPN21CZ"
};

const APP_ID = 'apt-tracker-jlgc';

// ── Firebase Context ─────────────────────────────────────────────────────────
const FirebaseContext = createContext(null);

const FirebaseProvider = ({ children }) => {
  const [db, setDb] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      const dbInstance = getFirestore(app);
      setDb(dbInstance);
      enableIndexedDbPersistence(dbInstance).catch(err => console.error('Persistence error:', err));
    } catch (e) {
      console.error('Firebase init error:', e);
    }
    // Shared fixed user — same data across all devices
    setUserId('jlgc-shared-user');
    setIsAuthReady(true);
  }, []);

  return (
    <FirebaseContext.Provider value={{ db, userId, isAuthReady }}>
      {children}
    </FirebaseContext.Provider>
  );
};

// ── Constants ────────────────────────────────────────────────────────────────
const APARTMENT_COUNT = 16;

const STATUS_OPTIONS = [
  { key: '', description: 'OK' },
  { key: 'NC', description: 'Needs Cleaning' },
  { key: 'NP', description: 'Needs Painting' },
  { key: 'NR', description: 'Needs Repair' },
  { key: 'SC', description: 'Scratched' },
  { key: 'RP', description: 'Needs Replacing' },
  { key: 'KI', description: 'Known Issue' },
  { key: 'NA', description: 'Not Applicable' },
];

const SECTION_THEMES = {
  EntryWayStairs:     { bg: 'bg-slate-50',   border: 'border-slate-200',   icon: 'text-slate-600',   accent: 'bg-slate-600'   },
  EntryWayClosets:    { bg: 'bg-slate-50',   border: 'border-slate-200',   icon: 'text-slate-600',   accent: 'bg-slate-600'   },
  LivingRoom:         { bg: 'bg-sky-50',     border: 'border-sky-200',     icon: 'text-sky-600',     accent: 'bg-sky-600'     },
  Kitchen:            { bg: 'bg-orange-50',  border: 'border-orange-200',  icon: 'text-orange-600',  accent: 'bg-orange-600'  },
  Appliances:         { bg: 'bg-amber-50',   border: 'border-amber-200',   icon: 'text-amber-600',   accent: 'bg-amber-600'   },
  Hallways:           { bg: 'bg-zinc-50',    border: 'border-zinc-200',    icon: 'text-zinc-600',    accent: 'bg-zinc-600'    },
  Bedroom:            { bg: 'bg-purple-50',  border: 'border-purple-200',  icon: 'text-purple-600',  accent: 'bg-purple-600'  },
  Bathroom:           { bg: 'bg-blue-50',    border: 'border-blue-200',    icon: 'text-blue-600',    accent: 'bg-blue-600'    },
  Balcony:            { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'text-emerald-600', accent: 'bg-emerald-600' },
  BalconyPatioGarage: { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'text-emerald-600', accent: 'bg-emerald-600' },
  Notes:              { bg: 'bg-rose-50',    border: 'border-rose-200',    icon: 'text-rose-600',    accent: 'bg-rose-600'    },
};

const defaultRoomItems = {
  LivingRoom:         ['Floor', 'Walls', 'Ceiling', 'Windows', 'Blinds', 'Light Fixtures', 'Outlets/Switches', 'Vents'],
  Bedroom:            ['Floor', 'Walls', 'Ceiling', 'Windows', 'Blinds', 'Light Fixtures', 'Outlets/Switches', 'Doors', 'Closet', 'Vents'],
  Kitchen:            ['Countertops', 'Cabinets', 'Sink', 'Faucet', 'Floor', 'Light Fixtures', 'Garbage Disposal', 'Exhaust Fan', 'Drawers'],
  Bathroom:           ['Sink', 'Faucet', 'Toilet', 'Shower/Tub', 'Mirror', 'Ceiling', 'Doors', 'Cabinets', 'Caulking', 'Towel Rack', 'Window', 'Floor', 'Walls', 'Grout/Tile', 'Vent fan'],
  Balcony:            ['Railing', 'Floor'],
  BalconyPatioGarage: ['Railing', 'Patio Floor', 'Garage Door', 'Garage Floor', 'Garage Outlets'],
  Hallways:           ['Floor', 'Walls', 'Light Fixtures', 'Closets'],
  EntryWayStairs:     ['Floors', 'Walls', 'Windows', 'Carpet/Tile', 'Smoke/Carbon Monoxide Detectors', 'Thermostat', 'Closets'],
  EntryWayClosets:    ['Floors', 'Walls', 'Windows', 'Carpet/Tile', 'Smoke/Carbon Monoxide Detectors', 'Thermostat', 'Closets'],
  Appliances:         ['Refrigerator', 'Stove/Oven', 'Microwave', 'Dishwasher', 'Washing Machine', 'Dryer'],
  Notes:              ['General Notes'],
};

const createChecklistItem = name => ({ name, moveInStatus: '', midSeasonStatus: '', moveOutStatus: '' });

const generateDefaultRooms = groupType => {
  let configs = [
    { name: 'Entry Way + Stairs', type: 'EntryWayStairs' },
    { name: 'Living Room',        type: 'LivingRoom' },
    { name: 'Kitchen',            type: 'Kitchen' },
    { name: 'Appliances',         type: 'Appliances' },
    { name: 'Hallways',           type: 'Hallways' },
    { name: 'Bedroom 1',          type: 'Bedroom' },
    { name: 'Bathroom 1',         type: 'Bathroom' },
    { name: 'Bedroom 2',          type: 'Bedroom' },
    { name: 'Bathroom 2',         type: 'Bathroom' },
    { name: 'Bedroom 3',          type: 'Bedroom' },
    { name: 'Bathroom 3',         type: 'Bathroom' },
    { name: 'Balcony/Patio',      type: 'Balcony' },
    { name: 'Notes',              type: 'Notes' },
  ];
  if (groupType === 'Floresta') {
    configs = configs.map(c => c.name === 'Balcony/Patio' ? { name: 'Balcony/Patio/Garage', type: 'BalconyPatioGarage' } : c);
  } else if (groupType === 'Sophia') {
    configs = configs
      .filter(c => c.name !== 'Bathroom 3')
      .map(c => c.name === 'Entry Way + Stairs' ? { name: 'Entry Way + Closets', type: 'EntryWayClosets' } : c);
  }
  return configs.map(c => ({ name: c.name, type: c.type, items: (defaultRoomItems[c.type] || []).map(createChecklistItem) }));
};

const APT_ORDER = { 'F-204':0,'F-801':1,'F-807':2,'F-1504':3,'F-1510':4,'F-1607':5,'F-1712':6,'F-1810':7,'S 6-204':8,'S 7-104':9,'S 16-104':10,'S 16-105':11,'S 16-108':12,'S 16-201':13,'S 16-204':14,'S 16-208':15 };

const getAptIdFromNumber = num => {
  const map = {1:'F-204',2:'F-801',3:'F-807',4:'F-1504',5:'F-1510',6:'F-1607',7:'F-1712',8:'F-1810',9:'S 6-204',10:'S 7-104',11:'S 16-104',12:'S 16-105',13:'S 16-108',14:'S 16-201',15:'S 16-204',16:'S 16-208'};
  return map[num] || `Apt ${num}`;
};

// ── Confirmation Modal ───────────────────────────────────────────────────────
const ConfirmationModal = ({ message, isOpen, onConfirm, onCancel }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100] print:hidden">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md border-t-8 border-red-500">
        <h3 className="text-xl font-bold mb-4">Confirm Action</h3>
        <p className="text-gray-600 mb-8">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-5 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold">Cancel</button>
          <button onClick={onConfirm} className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold">Confirm Archive</button>
        </div>
      </div>
    </div>
  );
};

// ── Main App ─────────────────────────────────────────────────────────────────
const App = () => {
  const { db, userId, isAuthReady } = useContext(FirebaseContext) || {};

  const [apartments, setApartments] = useState([]);
  const [selectedApartmentIndex, setSelectedApartmentIndex] = useState(0);
  const [currentChecklistData, setCurrentChecklistData] = useState(null);
  const [selectedChecklistVersionId, setSelectedChecklistVersionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isArchiveConfirmOpen, setIsArchiveConfirmOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState({ Floresta: false, Sophia: false });
  const [searchQuery, setSearchQuery] = useState('');
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);

  const roomRefs = useRef({});

  useEffect(() => {
    const handler = () => setShowBackToTop(window.scrollY > 200);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const toggleGroup = group => setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }));

  // ── Bootstrap apartments ─────────────────────────────────────────────────
  useEffect(() => {
    if (!db || !isAuthReady || !userId) return;
    const colRef = collection(db, 'artifacts', APP_ID, 'users', userId, 'apartments');
    const unsub = onSnapshot(query(colRef), async snapshot => {
      if (!snapshot.empty) {
        const meta = snapshot.docs.map(d => ({ id: d.id, apartmentId: d.data().apartmentId, allChecklistVersions: [] }));
        const sorted = meta.sort((a, b) => (APT_ORDER[a.apartmentId] ?? 99) - (APT_ORDER[b.apartmentId] ?? 99));
        setApartments(sorted);
        setLoading(false);
        if (sorted.length > 0 && currentChecklistData === null) handleApartmentSelect(sorted[0].apartmentId);
      } else {
        const batch = writeBatch(db);
        for (let i = 1; i <= APARTMENT_COUNT; i++) {
          const aptId = getAptIdFromNumber(i);
          const aptDoc = doc(colRef, aptId);
          batch.set(aptDoc, { apartmentId: aptId });
          const clRef = collection(aptDoc, 'checklists');
          const group = aptId.startsWith('S ') ? 'Sophia' : 'Floresta';
          batch.set(doc(clRef), { rooms: generateDefaultRooms(group), timestamp: new Date().toISOString() });
        }
        await batch.commit();
      }
    }, err => console.error('Snapshot error:', err));
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, userId, isAuthReady]);

  // ── Select apartment ─────────────────────────────────────────────────────
  const handleApartmentSelect = useCallback(async aptId => {
    if (!db || !userId) return;
    setLoading(true);
    const idx = apartments.findIndex(a => a.apartmentId === aptId);
    if (idx !== -1) setSelectedApartmentIndex(idx);

    const clRef = collection(db, 'artifacts', APP_ID, 'users', userId, 'apartments', aptId, 'checklists');
    const snap = await getDocs(query(clRef, orderBy('timestamp', 'desc')));
    const versions = snap.docs.map(d => ({ id: d.id, rooms: d.data().rooms || [], timestamp: d.data().timestamp, archivedAt: d.data().archivedAt || null }));

    setApartments(prev => prev.map(a => a.apartmentId === aptId ? { ...a, allChecklistVersions: versions } : a));
    if (versions.length > 0) { setSelectedChecklistVersionId(versions[0].id); setCurrentChecklistData(versions[0].rooms); }
    else { setSelectedChecklistVersionId(null); setCurrentChecklistData(null); }
    setLoading(false);
  }, [db, userId, apartments]);

  // ── Switch history version ───────────────────────────────────────────────
  const handleVersionChange = versionId => {
    const apt = apartments[selectedApartmentIndex];
    const selectedVer = apt?.allChecklistVersions?.find(v => v.id === versionId);
    if (selectedVer) { setSelectedChecklistVersionId(versionId); setCurrentChecklistData(selectedVer.rooms); }
  };

  // ── Update checklist item ────────────────────────────────────────────────
  const updateItemStatus = useCallback(async (aptId, roomName, itemName, field, value) => {
    if (!selectedChecklistVersionId || !db || !userId) return;
    const clRef = doc(db, 'artifacts', APP_ID, 'users', userId, 'apartments', aptId, 'checklists', selectedChecklistVersionId);
    try {
      const updatedRooms = JSON.parse(JSON.stringify(currentChecklistData));
      const room = updatedRooms.find(r => r.name === roomName);
      if (!room) return;
      const item = room.items.find(i => i.name === itemName);
      if (item) { if (roomName === 'Notes') item.moveInStatus = value; else item[field] = value; }
      await updateDoc(clRef, { rooms: updatedRooms, timestamp: new Date().toISOString() });
      setCurrentChecklistData(updatedRooms);
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 2000);
    } catch (e) { console.error('Save error:', e); }
  }, [db, userId, selectedChecklistVersionId, currentChecklistData]);

  // ── Archive & create fresh ───────────────────────────────────────────────
  const handleArchiveAndNew = async () => {
    if (!db || !userId) return;
    setIsArchiveConfirmOpen(false);
    setLoading(true);
    const apt = apartments[selectedApartmentIndex];
    if (selectedChecklistVersionId) {
      const clRef = doc(db, 'artifacts', APP_ID, 'users', userId, 'apartments', apt.apartmentId, 'checklists', selectedChecklistVersionId);
      await updateDoc(clRef, { archivedAt: new Date().toISOString() });
    }
    const colRef = collection(db, 'artifacts', APP_ID, 'users', userId, 'apartments', apt.apartmentId, 'checklists');
    const group = apt.apartmentId.startsWith('S ') ? 'Sophia' : 'Floresta';
    await setDoc(doc(colRef), { rooms: generateDefaultRooms(group), timestamp: new Date().toISOString() });
    handleApartmentSelect(apt.apartmentId);
  };

  const scrollToSection = name => {
    const el = roomRefs.current[name];
    if (el) { const top = el.getBoundingClientRect().top + window.pageYOffset - 180; window.scrollTo({ top, behavior: 'smooth' }); }
  };

  const getRoomTheme = type => SECTION_THEMES[type] || SECTION_THEMES.Notes;

  const currentApt = apartments[selectedApartmentIndex];
  const currentVersion = currentApt?.allChecklistVersions?.find(v => v.id === selectedChecklistVersionId);
  const isArchived = currentVersion ? currentVersion.archivedAt !== null : false;

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-gray-900 pb-20 print:bg-white print:pb-0">
      <style>{`
        @media print {
          @page { margin: 15mm; size: A4; }
          body { background: white !important; font-size: 10pt; }
          .no-print { display: none !important; }
          .print-header { display: block !important; border-bottom: 2px solid #000; margin-bottom: 20px; padding-bottom: 10px; }
          .print-section { break-inside: avoid; border: 1px solid #ddd !important; margin-bottom: 20px !important; background: white !important; }
          .print-grid { display: grid !important; grid-template-columns: 2fr 1fr 1fr 1fr !important; gap: 5px !important; }
          .print-label { font-weight: bold; font-size: 8pt; text-transform: uppercase; color: #666; }
          .print-value { font-size: 9pt; font-weight: bold; border: 1px solid #eee; padding: 4px; text-align: center; }
        }
      `}</style>

      {/* ── Header ── */}
      <header className="sticky top-0 z-[60] bg-white border-b px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 shadow-sm no-print">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2.5 rounded-xl text-white shadow-indigo-200 shadow-lg"><LayoutDashboard size={24}/></div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-gray-900 leading-none">AptTracker Pro</h1>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Jonathan's Landing GC · Housing</span>
          </div>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
            <input type="text" placeholder="Search Units..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none w-48"/>
          </div>
          <button onClick={() => setIsArchiveConfirmOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-bold hover:bg-slate-900 transition-all shadow-md">
            <Archive size={16}/> Archive
          </button>
        </div>
      </header>

      {/* Print Header */}
      <div className="hidden print:block print-header">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tighter">Inspection Checklist</h1>
            <p className="text-lg font-bold text-gray-600">Unit: {currentApt?.apartmentId} · Jonathan's Landing GC</p>
          </div>
          <div className="text-right text-xs">
            <p>Generated: {new Date().toLocaleDateString()}</p>
            {isArchived && currentVersion?.archivedAt && <p className="text-red-600 font-bold">ARCHIVED: {new Date(currentVersion.archivedAt).toLocaleDateString()}</p>}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto p-4 md:p-8">

        {/* ── Unit Navigation ── */}
        <div className="grid md:grid-cols-2 gap-6 mb-12 no-print">
          {['Floresta', 'Sophia'].map(group => (
            <div key={group} className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
              <button onClick={() => toggleGroup(group)}
                className={`w-full flex justify-between items-center px-6 py-4 text-xs font-black uppercase tracking-[0.2em] ${group === 'Floresta' ? 'text-indigo-700 bg-indigo-50/50' : 'text-amber-700 bg-amber-50/50'}`}>
                <span className="flex items-center gap-2"><List size={14}/> {group}</span>
                {collapsedGroups[group] ? <ChevronDown size={18}/> : <ChevronUp size={18}/>}
              </button>
              {!collapsedGroups[group] && (
                <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {apartments
                    .filter(a => group === 'Floresta' ? a.apartmentId.startsWith('F-') : a.apartmentId.startsWith('S '))
                    .filter(a => a.apartmentId.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(apt => {
                      const isActive = apartments[selectedApartmentIndex]?.apartmentId === apt.apartmentId;
                      return (
                        <button key={apt.id} onClick={() => handleApartmentSelect(apt.apartmentId)}
                          className={`px-3 py-2.5 text-xs font-black rounded-xl border transition-all ${isActive ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-white text-gray-700 hover:bg-gray-50 border-gray-200'}`}>
                          {apt.apartmentId}
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Checklist ── */}
        {currentChecklistData ? (
          <div className="animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-baseline gap-4 mb-8 bg-white p-8 rounded-[2rem] border shadow-sm print:hidden">
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-5xl font-black text-gray-900 tracking-tight">{currentApt?.apartmentId}</h2>
                  {isArchived && <span className="px-3 py-1 bg-amber-100 text-amber-700 text-[10px] font-black uppercase rounded-full border border-amber-200">Archived Record</span>}
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 mt-4">
                  <p className="text-gray-400 font-bold text-sm flex items-center gap-2">
                    <History size={16} className="text-indigo-400"/>
                    {isArchived && currentVersion?.archivedAt ? `Record closed on ${new Date(currentVersion.archivedAt).toLocaleDateString()}` : 'Current Inspection'}
                  </p>
                  {/* History version selector */}
                  {currentApt?.allChecklistVersions?.length > 1 && (
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                      <Clock size={14} className="text-slate-400"/>
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">History</span>
                      <select
                        className="bg-transparent text-[11px] font-bold text-slate-800 outline-none cursor-pointer"
                        value={selectedChecklistVersionId || ''}
                        onChange={e => handleVersionChange(e.target.value)}
                      >
                        {currentApt.allChecklistVersions.map((v, idx) => (
                          <option key={v.id} value={v.id}>
                            {idx === 0 ? 'Current' : `Archived: ${new Date(v.timestamp).toLocaleDateString()}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <button onClick={() => window.print()} className="flex items-center gap-2 px-5 py-3 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-2xl text-xs font-black transition-all border border-indigo-100">
                  <Printer size={16}/> Export PDF / Print
                </button>
                <div className="relative group/jump flex-1 md:flex-none">
                  <div className="flex items-center bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 hover:border-indigo-300 transition-colors cursor-pointer min-w-[180px]">
                    <ArrowRight className="text-indigo-500 mr-3" size={18}/>
                    <span className="text-xs font-black text-gray-700">Quick Jump</span>
                    <ChevronDown size={16} className="text-gray-400 ml-2"/>
                  </div>
                  <div className="absolute top-full right-0 mt-3 w-64 bg-white border border-gray-200 rounded-3xl shadow-2xl z-[70] py-3 invisible group-hover/jump:visible opacity-0 group-hover/jump:opacity-100 transition-all duration-200 overflow-hidden">
                    <div className="max-h-80 overflow-y-auto px-2 space-y-1">
                      {currentChecklistData.map(room => {
                        const theme = getRoomTheme(room.type);
                        return (
                          <button key={room.name} onClick={() => scrollToSection(room.name)}
                            className="w-full text-left px-4 py-3 text-xs font-black rounded-xl hover:bg-gray-50 transition-all flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${theme.accent}`}></div>
                            <span className={theme.icon}>{room.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Rooms */}
            <div className="space-y-10 print:space-y-4">
              {currentChecklistData.map((room, rIdx) => {
                const theme = getRoomTheme(room.type);
                return (
                  <section key={rIdx} ref={el => roomRefs.current[room.name] = el}
                    className={`rounded-[2.5rem] border ${theme.border} shadow-sm overflow-hidden transition-all hover:shadow-lg ${theme.bg} print:print-section print:rounded-lg`}>
                    <div className="px-10 py-6 border-b border-inherit flex items-center justify-between print:px-4 print:py-2">
                      <div className="flex items-center gap-5">
                        <div className={`bg-white p-3.5 rounded-[1.25rem] border ${theme.border} ${theme.icon} print:hidden`}><Home size={24}/></div>
                        <h3 className="font-black text-2xl text-gray-900 print:text-lg">{room.name}</h3>
                      </div>
                      <div className="text-[10px] font-black text-gray-300 uppercase tracking-widest print:text-black">Section {String(rIdx+1).padStart(2,'0')}</div>
                    </div>
                    <div className="p-8 md:p-10 print:p-4">
                      {room.name === 'Notes' ? (
                        <div className="bg-white rounded-[2rem] p-8 border border-rose-200 print:rounded-lg print:p-4">
                          <textarea
                            disabled={isArchived}
                            className={`w-full h-56 bg-transparent outline-none text-gray-700 font-bold leading-relaxed resize-none text-lg no-print ${isArchived ? 'cursor-not-allowed' : ''}`}
                            placeholder="Record master inspection notes, damage observations, tenant communications..."
                            defaultValue={room.items[0]?.moveInStatus}
                            onBlur={e => updateItemStatus(currentApt.apartmentId, room.name, 'General Notes', 'moveInStatus', e.target.value)}
                          />
                          <div className="hidden print:block text-sm text-gray-800 whitespace-pre-wrap">{room.items[0]?.moveInStatus || 'No notes recorded.'}</div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-4 print:gap-1">
                          <div className="hidden print:print-grid print:mb-1 print:px-2">
                            <div className="print-label">Item</div>
                            <div className="print-label text-center">Move-In</div>
                            <div className="print-label text-center">Inspection</div>
                            <div className="print-label text-center">Move-Out</div>
                          </div>
                          {room.items.map((item, iIdx) => (
                            <div key={iIdx} className="group p-6 bg-white rounded-[1.5rem] border border-inherit hover:shadow-md transition-all flex flex-col xl:flex-row items-center gap-8 print:print-grid print:p-1 print:rounded-none print:border-b print:border-gray-100 print:gap-2">
                              <div className="flex-1 flex items-center gap-4 w-full print:gap-2">
                                <div className={`w-3 h-3 rounded-full ${theme.accent} opacity-20 print:hidden`}></div>
                                <span className="font-black text-gray-700 text-sm print:text-xs">{item.name}</span>
                              </div>
                              <div className="grid grid-cols-3 gap-4 w-full xl:w-auto min-w-[420px] no-print">
                                {[['moveInStatus','MOVE-IN'],['midSeasonStatus','INSPECTION'],['moveOutStatus','MOVE-OUT']].map(([field, label]) => (
                                  <div key={field}>
                                    <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">{label}</div>
                                    <select disabled={isArchived} value={item[field] || ''}
                                      onChange={e => updateItemStatus(currentApt.apartmentId, room.name, item.name, field, e.target.value)}
                                      className={`w-full text-[11px] font-black py-3 px-4 border rounded-xl outline-none transition-all bg-gray-50 ${isArchived ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-indigo-300'}`}>
                                      {STATUS_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.description}</option>)}
                                    </select>
                                  </div>
                                ))}
                              </div>
                              <div className="hidden print:contents">
                                <div className="print-value">{item.moveInStatus || 'OK'}</div>
                                <div className="print-value">{item.midSeasonStatus || 'OK'}</div>
                                <div className="print-value">{item.moveOutStatus || 'OK'}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-48 text-gray-300 bg-white rounded-[3rem] border-4 border-dashed border-gray-100 no-print">
            <Loader2 className="animate-spin mb-6 text-indigo-500" size={64}/>
            <p className="text-2xl font-black text-indigo-900/30 uppercase tracking-widest">{loading ? 'Loading Unit Data...' : 'Select a unit above'}</p>
          </div>
        )}
      </main>

      {/* Print footer */}
      <div className="hidden print:block mt-10 pt-4 border-t border-gray-200">
        <div className="flex justify-between text-[8pt] text-gray-400 font-bold uppercase tracking-widest">
          <p>Jonathan's Landing GC · H2B Housing Inspection Report</p>
          <p>{new Date().toLocaleDateString()}</p>
        </div>
      </div>

      {showSaveSuccess && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-10 py-5 rounded-[2rem] shadow-2xl flex items-center gap-5 z-[100] border border-white/10 no-print">
          <Check size={16} strokeWidth={4} className="text-emerald-500"/>
          <span className="text-sm font-black tracking-tight">Cloud Sync Complete</span>
        </div>
      )}

      <ConfirmationModal
        isOpen={isArchiveConfirmOpen}
        message="This will archive the current Turn history and reset the checklist for a new inspection. Are you sure?"
        onConfirm={handleArchiveAndNew}
        onCancel={() => setIsArchiveConfirmOpen(false)}
      />

      {showBackToTop && (
        <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-10 right-10 p-6 bg-indigo-600 text-white rounded-[1.5rem] shadow-2xl hover:scale-110 active:scale-95 transition-all z-50 border-4 border-white no-print">
          <ArrowUp size={28} strokeWidth={3}/>
        </button>
      )}
    </div>
  );
};

const Root = () => <FirebaseProvider><App /></FirebaseProvider>;
export default Root;
