// App.tsx – Πόση ώρα θα σου πάρει να βρεις την έδρα (βελτιωμένη έκδοση)
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";

// Διεπαφές με καλύτερη ονομασία
interface Party {
  id: string;
  name: string;
  votes: number;
  isBlank?: boolean; // Λευκά (δεν υπολογίζονται στο μέτρο)
}

interface AllocationResult extends Party {
  automaticSeats: number;
  finalSeats: number;
  remainder: number;
  isLastKoutsi: boolean;
}

const App: React.FC = () => {
  // --- Αρχική Κατάσταση ---
  const [parties, setParties] = useState<Party[]>([
    { id: "pasp", name: "ΠΑΣΠ", votes: 180 },
    { id: "kke", name: "ΚΚΕ", votes: 155 },
    { id: "eaak", name: "ΕΑΑΚ", votes: 110 },
    { id: "aran", name: "ΑΡΑΝ", votes: 22 },
    { id: "nar", name: "ΝΑΡ", votes: 11 },
    { id: "dap", name: "ΔΑΠ", votes: 27 },
    { id: "ssp", name: "ΣΣΠ", votes: 3 },
    { id: "diktyo", name: "Δίκτυο", votes: 0 },
    { id: "blank", name: "Λευκά", votes: 7, isBlank: true },
  ]);

  const [totalSeats, setTotalSeats] = useState<number>(7);
  const [invalidVotes, setInvalidVotes] = useState<number>(0); // Άκυρα (μόνο για στατιστικά)
  const [roundUp, setRoundUp] = useState<boolean>(false); // Στρογγυλοποίηση μέτρου

  // --- Σειριοποίηση / Αποσειριοποίηση κατάστασης ---
  const [configCode, setConfigCode] = useState<string>("");

  // Δημιουργία κωδικού κατάστασης (χωρίς escape/unescape)
  const generateStateCode = useCallback(() => {
    const state = {
      seats: totalSeats,
      invalid: invalidVotes,
      roundUp,
      parties: parties.map(({ id, name, votes, isBlank }) => ({
        id,
        name,
        votes,
        isBlank,
      })),
    };
    try {
      const json = JSON.stringify(state);
      return btoa(encodeURIComponent(json));
    } catch {
      return "";
    }
  }, [totalSeats, invalidVotes, roundUp, parties]);

  useEffect(() => {
    setConfigCode(generateStateCode());
  }, [generateStateCode]);

  // Εφαρμογή κωδικού κατάστασης
  const applyStateCode = (code: string) => {
    try {
      const json = decodeURIComponent(atob(code));
      const state = JSON.parse(json);
      setTotalSeats(state.seats);
      setInvalidVotes(state.invalid);
      setRoundUp(state.roundUp);
      setParties(
        state.parties.map((p: any) => ({
          id: p.id || Math.random().toString(36).substr(2, 5),
          name: p.name,
          votes: p.votes,
          isBlank: p.isBlank || false,
        }))
      );
    } catch (e) {
      alert("Μη έγκυρος κωδικός κατάστασης");
    }
  };

  // --- Βοηθητικές Συναρτήσεις για Ψήφους ---
  const validParties = useMemo(() => parties.filter((p) => !p.isBlank), [parties]);
  const totalValidVotes = useMemo(
    () => validParties.reduce((sum, p) => sum + p.votes, 0),
    [validParties]
  );

  // Εκλογικό Μέτρο
  const quota = useMemo(() => {
    if (totalValidVotes === 0 || totalSeats === 0) return 0;
    const raw = totalValidVotes / totalSeats;
    return roundUp ? Math.ceil(raw) : Math.floor(raw);
  }, [totalValidVotes, totalSeats, roundUp]);

  // --- Υπολογισμός Αποτελεσμάτων Εκλογής ---
  const { results, seatLog, nextKoutsi, nextRemainder } = useMemo(() => {
    if (quota <= 0) {
      return {
        results: [],
        seatLog: [] as string[],
        nextKoutsi: null as string | null,
        nextRemainder: 0,
      };
    }

    // 1. Αρχική κατανομή με βάση το μέτρο
    const allocation: AllocationResult[] = validParties.map((party) => {
      const automaticSeats = Math.floor(party.votes / quota);
      const remainder = party.votes - automaticSeats * quota;
      return {
        ...party,
        automaticSeats,
        finalSeats: automaticSeats,
        remainder,
        isLastKoutsi: false,
      };
    });

    const allocatedSeats = allocation.reduce((sum, r) => sum + r.automaticSeats, 0);
    let remainingSeats = Math.max(0, totalSeats - allocatedSeats);
    const log: string[] = [];

    // 2. Διανομή κουτσών εδρών (μεγαλύτερα υπόλοιπα)
    // Δημιουργούμε αντίγραφο για να μην πειράξουμε τα αρχικά υπόλοιπα άμεσα
    const koutsiAllocation = allocation.map((r) => ({ ...r }));

    for (let i = 0; i < remainingSeats; i++) {
      // Ταξινόμηση με βάση το τρέχον υπόλοιπο (φθίνουσα) και μετά με βάση τις ψήφους
      koutsiAllocation.sort((a, b) => {
        if (b.remainder !== a.remainder) return b.remainder - a.remainder;
        return b.votes - a.votes;
      });

      const selected = koutsiAllocation[0];
      if (selected.remainder > 0) {
        log.push(`Κουτσή έδρα #${i + 1} ➜ ${selected.name} (υπόλοιπο ${selected.remainder})`);
        selected.finalSeats++;
        // ΣΗΜΑΝΤΙΚΟ: Μετά την εκχώρηση, το υπόλοιπο μηδενίζεται για αυτή την παράταξη
        // ώστε να μην ξαναπάρει κουτσή έδρα εκτός αν έχουν όλοι 0.
        selected.remainder = 0;
      } else {
        // Αν όλα τα υπόλοιπα είναι 0, δεν μπορούμε να δώσουμε άλλη κουτσή έδρα
        log.push(`⚠️ Αδυναμία διανομής: όλα τα υπόλοιπα είναι 0.`);
        break;
      }
    }

    // Βρίσκουμε την επόμενη κουτσή έδρα αν υπήρχε μία παραπάνω έδρα
    const nextAllocation = allocation.map((r) => ({
      ...r,
      remainder: r.votes - r.automaticSeats * quota,
    }));
    nextAllocation.sort((a, b) => {
      if (b.remainder !== a.remainder) return b.remainder - a.remainder;
      return b.votes - a.votes;
    });

    const next = nextAllocation[0];
    const nextKoutsiName = next && next.remainder > 0 ? next.name : null;
    const nextRem = next ? next.remainder : 0;

    // Προσθέτουμε την ένδειξη για την τελευταία κουτσή έδρα
    const finalResults = koutsiAllocation.map((r) => {
      const isLast = log.length > 0 && r.name === log[log.length - 1].split("➜ ")[1];
      return { ...r, isLastKoutsi: isLast };
    });

    // Τελική ταξινόμηση ανάλογα με τις ψήφους για το γράφημα
    finalResults.sort((a, b) => b.votes - a.votes);

    return {
      results: finalResults,
      seatLog: log,
      nextKoutsi: nextKoutsiName,
      nextRemainder: nextRem,
    };
  }, [validParties, totalSeats, quota]);

  // --- Διαχείριση Αλλαγών στα Inputs ---
  const updatePartyVotes = (index: number, delta: number) => {
    setParties((prev) => {
      const updated = [...prev];
      const party = updated[index];
      updated[index] = { ...party, votes: Math.max(0, party.votes + delta) };
      return updated;
    });
  };

  const setPartyVotes = (index: number, value: number) => {
    setParties((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], votes: Math.max(0, value) };
      return updated;
    });
  };

  const setPartyName = (index: number, name: string) => {
    setParties((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], name };
      return updated;
    });
  };

  const resetAllVotes = () => {
    setParties((prev) => prev.map((p) => ({ ...p, votes: 0 })));
  };

  // --- Χρώματα Γραφήματος (ίδια με πριν) ---
  const COLORS = [
    "#f58231",
    "#3cb44b",
    "#e6194b",
    "#ffb6c1",
    "#4363d8",
    "#911eb4",
    "#46f0f0",
    "#aaaaaa",
  ];

  return (
    <div className="min-h-screen bg-[#121212] text-[#f1f1f1] p-4 font-sans antialiased">
      <div className="max-w-7xl mx-auto">
        {/* Κεφαλίδα */}
        <header className="mb-8 text-center">
          <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#bb86fc] to-[#03dac6] bg-clip-text text-transparent py-2">
            Πόση ώρα θα σου πάρει να βρεις την έδρα
          </h1>
          <p className="text-gray-400">Προσομοίωση εκλογικού συστήματος απλής αναλογικής με κουτσές έδρες</p>
        </header>

        {/* Κύριο Περιεχόμενο: Δύο Στήλες */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Στήλη 1: Εισαγωγή Δεδομένων */}
          <div className="space-y-6">
            {/* Κάρτα: Λίστα Παρατάξεων */}
            <div className="bg-[#1e1e1e] rounded-xl p-5 shadow-lg border border-[#333]">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <span className="w-2 h-6 bg-[#bb86fc] rounded-full"></span>
                Ψήφοι Παρατάξεων
              </h2>
              <div className="space-y-3">
                {parties.map((party, index) => (
                  <div key={party.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={party.name}
                      onChange={(e) => setPartyName(index, e.target.value)}
                      className="flex-1 bg-[#2a2a2a] border border-[#444] rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#bb86fc]"
                      placeholder="Όνομα"
                    />
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updatePartyVotes(index, -1)}
                        disabled={party.votes <= 0}
                        className="w-9 h-9 flex items-center justify-center bg-[#2a2a2a] hover:bg-[#3a3a3a] disabled:opacity-40 rounded-lg text-xl font-bold transition-colors"
                      >
                        –
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={party.votes}
                        onChange={(e) => setPartyVotes(index, parseInt(e.target.value) || 0)}
                        className="w-20 bg-[#2a2a2a] border border-[#444] rounded-lg px-2 py-2 text-center text-white focus:outline-none focus:ring-2 focus:ring-[#bb86fc] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button
                        type="button"
                        onClick={() => updatePartyVotes(index, 1)}
                        className="w-9 h-9 flex items-center justify-center bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded-lg text-xl font-bold transition-colors"
                      >
                        +
                      </button>
                    </div>
                    {party.isBlank && (
                      <span className="text-xs bg-[#333] px-2 py-1 rounded text-gray-300">Λευκά</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={resetAllVotes}
                  className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-300 rounded-lg text-sm font-medium transition-colors border border-red-600/30"
                >
                  Μηδενισμός Ψήφων
                </button>
              </div>
            </div>

            {/* Κάρτα: Ρυθμίσεις Εκλογής */}
            <div className="bg-[#1e1e1e] rounded-xl p-5 shadow-lg border border-[#333]">
              <h2 className="text-xl font-semibold mb-4 flex items-ce