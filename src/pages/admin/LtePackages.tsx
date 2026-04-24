import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../components/ui/table";
import { Button } from "../../../components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../../components/ui/dialog";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Badge } from "../../../components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../../components/ui/select";

export default function AdminLtePackages() {
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const fupRef = useRef<HTMLTextAreaElement | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "card">("list");
  const [search, setSearch] = useState("");
  const [filterNetwork, setFilterNetwork] = useState<"all" | "MTN" | "Vodacom" | "Telkom" | "other">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [filterCapType, setFilterCapType] = useState<"all" | "capped" | "uncapped">("all");
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    capType: "capped" as "capped" | "uncapped",
    dataCapGB: "",
    dayCapGB: "",
    nightCapGB: "",
    speedMbps: "",
    fup: "",
    price: "",
    durationDays: "",
    network: "MTN",
    isActive: true,
  });

  const normalizeDecimalInput = (raw: string) => String(raw || "").replace(/[^\d.,]/g, "");

  const toNumberOrNull = (raw: string) => {
    const trimmed = String(raw || "").trim();
    if (!trimmed) return null;
    const normalized = trimmed.replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : NaN;
  };

  const setFup = (next: string) => setFormData((prev) => ({ ...prev, fup: next }));

  const withFupSelection = (fn: (value: string, start: number, end: number) => { value: string; start: number; end: number }) => {
    const el = fupRef.current;
    const current = String(formData.fup || "");
    const start = el ? el.selectionStart ?? current.length : current.length;
    const end = el ? el.selectionEnd ?? current.length : current.length;
    const next = fn(current, start, end);
    setFup(next.value);
    requestAnimationFrame(() => {
      const t = fupRef.current;
      if (!t) return;
      t.focus();
      t.setSelectionRange(next.start, next.end);
    });
  };

  const wrapSelection = (before: string, after: string) =>
    withFupSelection((value, start, end) => {
      const selected = value.slice(start, end);
      const nextValue = value.slice(0, start) + before + selected + after + value.slice(end);
      const nextStart = start + before.length;
      const nextEnd = end + before.length;
      return { value: nextValue, start: nextStart, end: nextEnd };
    });

  const prefixLines = (prefix: string) =>
    withFupSelection((value, start, end) => {
      const left = value.slice(0, start);
      const right = value.slice(end);
      const selected = value.slice(start, end);
      const startLineIndex = left.lastIndexOf("\n") + 1;
      const endLineIndex = end + (value.slice(end).indexOf("\n") === -1 ? value.length - end : value.slice(end).indexOf("\n"));
      const block = value.slice(startLineIndex, endLineIndex);
      const nextBlock = block
        .split("\n")
        .map((line) => (line.trim() ? `${prefix}${line}` : line))
        .join("\n");
      const nextValue = value.slice(0, startLineIndex) + nextBlock + value.slice(endLineIndex);
      const delta = nextBlock.length - block.length;
      const nextStart = start + (nextBlock.startsWith(prefix) ? prefix.length : 0);
      const nextEnd = end + delta;
      return { value: nextValue, start: nextStart, end: nextEnd };
    });

  const insertLink = () =>
    withFupSelection((value, start, end) => {
      const selected = value.slice(start, end) || "link text";
      const snippet = `[${selected}](https://)`;
      const nextValue = value.slice(0, start) + snippet + value.slice(end);
      const urlStart = start + snippet.lastIndexOf("(") + 1;
      const urlEnd = urlStart + "https://".length;
      return { value: nextValue, start: urlStart, end: urlEnd };
    });

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api<{ packages: any[] }>("/api/lte-packages?activeOnly=false");
      const next = Array.isArray((res as any)?.packages) ? (res as any).packages : [];
      setPackages(next);
    } catch (e) {
      console.error(e);
      const code = (e as any)?.code ? String((e as any).code) : "";
      const message = (e as any)?.message ? String((e as any).message) : "";
      let extra = code || message ? ` (${code || message})` : "";
      try {
        const health = await api<any>("/api/health");
        const missing = Array.isArray(health?.schema?.missing) ? health.schema.missing : [];
        if (missing.length > 0) extra += ` [schema missing: ${missing.join(", ")}]`;
      } catch {
      }
      alert(`Failed to load LTE / 5G packages${extra}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateDialog = () => {
    setFormData({
      name: "",
      description: "",
      capType: "capped",
      dataCapGB: "",
      dayCapGB: "",
      nightCapGB: "",
      speedMbps: "",
      fup: "",
      price: "",
      durationDays: "",
      network: "MTN",
      isActive: true,
    });
    setEditingId(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (pkg: any) => {
    setFormData({
      name: pkg.name,
      description: pkg.description,
      capType: pkg.dataCapGB === null ? "uncapped" : "capped",
      dataCapGB: pkg.dataCapGB === null ? "" : String(pkg.dataCapGB),
      dayCapGB: pkg.dayCapGB === null || pkg.dayCapGB === undefined ? "" : String(pkg.dayCapGB),
      nightCapGB: pkg.nightCapGB === null || pkg.nightCapGB === undefined ? "" : String(pkg.nightCapGB),
      speedMbps: pkg.speedMbps === null ? "" : String(pkg.speedMbps),
      fup: String(pkg.fup || ""),
      price: pkg.price.toString(),
      durationDays: pkg.durationDays.toString(),
      network: pkg.network ? String(pkg.network) : "MTN",
      isActive: pkg.isActive,
    });
    setEditingId(pkg.id);
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    try {
      const isCapped = formData.capType === "capped";
      const dataCapGB = isCapped ? toNumberOrNull(formData.dataCapGB) : null;
      const dayCapGB = isCapped ? toNumberOrNull(formData.dayCapGB) : null;
      const nightCapGB = isCapped ? toNumberOrNull(formData.nightCapGB) : null;
      if (isCapped && dataCapGB === null) {
        alert("Please enter a total cap for capped packages.");
        return;
      }
      if (dataCapGB !== null && Number.isNaN(dataCapGB)) {
        alert("Total cap must be a valid number (e.g. 12.5 or 12,5).");
        return;
      }
      if (dayCapGB !== null && Number.isNaN(dayCapGB)) {
        alert("Day cap must be a valid number (e.g. 12.5 or 12,5).");
        return;
      }
      if (nightCapGB !== null && Number.isNaN(nightCapGB)) {
        alert("Night cap must be a valid number (e.g. 12.5 or 12,5).");
        return;
      }

      const payload = {
        name: formData.name,
        description: formData.description,
        fup: formData.fup,
        dataCapGB,
        dayCapGB,
        nightCapGB,
        speedMbps: formData.speedMbps === "" ? null : Number(formData.speedMbps),
        network: formData.network,
        price: Number(formData.price),
        durationDays: Number(formData.durationDays),
        isActive: formData.isActive,
      };

      if (editingId) {
        await api(`/api/admin/lte-packages/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await api("/api/admin/lte-packages", { method: "POST", body: JSON.stringify(payload) });
      }
      setIsDialogOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      const code = (err as any)?.code ? String((err as any).code) : "";
      const message = (err as any)?.message ? String((err as any).message) : "";
      const extra = code || message ? ` (${code || message})` : "";
      alert(`${editingId ? "Failed to update package" : "Failed to add package"}${extra}`);
    }
  };

  const toggleStatus = async (pkgId: string, currentStatus: boolean) => {
    try {
      await api(`/api/admin/lte-packages/${pkgId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !currentStatus }),
      });
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const deletePackage = async (pkg: any) => {
    if (!pkg?.id) return;
    if (!confirm(`Delete LTE / 5G package "${pkg.name}"?`)) return;
    try {
      await api(`/api/admin/lte-packages/${pkg.id}`, { method: "DELETE", body: JSON.stringify({}) });
      loadData();
    } catch (e: any) {
      console.error(e);
      const code = String(e?.code || e?.message || "");
      if (code === "in_use") {
        alert("This package cannot be deleted because it is referenced by existing orders.");
        return;
      }
      alert(`Failed to delete package${code ? ` (${code})` : ""}.`);
    }
  };

  const reorder = async (next: any[]) => {
    setPackages(next);
    try {
      await api("/api/admin/lte-packages/reorder", {
        method: "POST",
        body: JSON.stringify({ ids: next.map((p) => p.id) }),
      });
    } catch (e) {
      console.error(e);
      loadData();
    }
  };

  const providers = ["MTN", "Vodacom", "Telkom"] as const;

  const getNetworkKey = (network: any): "MTN" | "Vodacom" | "Telkom" | "other" => {
    const n = String(network || "").trim();
    if (n === "MTN") return "MTN";
    if (n === "Vodacom") return "Vodacom";
    if (n === "Telkom") return "Telkom";
    return "other";
  };

  const getCapType = (pkg: any): "capped" | "uncapped" => (pkg?.dataCapGB === null ? "uncapped" : "capped");

  const normalizedSearch = search.trim().toLowerCase();
  const canReorder =
    viewMode === "list" && normalizedSearch === "" && filterNetwork === "all" && filterStatus === "all" && filterCapType === "all";

  const matchesFilters = (pkg: any) => {
    const net = getNetworkKey(pkg.network);
    if (filterNetwork !== "all" && net !== filterNetwork) return false;
    if (filterStatus !== "all") {
      const desired = filterStatus === "active";
      if (Boolean(pkg.isActive) !== desired) return false;
    }
    if (filterCapType !== "all" && getCapType(pkg) !== filterCapType) return false;
    if (normalizedSearch) {
      const hay = `${String(pkg.name || "")} ${String(pkg.description || "")} ${String(pkg.fup || "")}`.toLowerCase();
      if (!hay.includes(normalizedSearch)) return false;
    }
    return true;
  };

  const visiblePackages = packages.filter(matchesFilters);

  const buildSections = () => {
    const byNetwork: Record<string, any[]> = {};
    for (const p of visiblePackages) {
      const k = getNetworkKey(p.network);
      if (!byNetwork[k]) byNetwork[k] = [];
      byNetwork[k].push(p);
    }
    const sections: { key: "MTN" | "Vodacom" | "Telkom" | "other"; title: string; items: any[] }[] = [];
    for (const n of providers) {
      const k = n;
      const items = byNetwork[k] || [];
      sections.push({ key: k, title: n, items });
    }
    const otherItems = byNetwork.other || [];
    if (otherItems.length > 0) sections.push({ key: "other", title: "Other", items: otherItems });
    return sections.filter((s) => s.items.length > 0);
  };

  const sections = buildSections();

  const handleDropOnInSection = async (sectionKey: "MTN" | "Vodacom" | "Telkom" | "other", targetId: string, draggedId: string | null) => {
    if (!canReorder) return;
    if (!draggedId || draggedId === targetId) return;

    const current = [...packages];
    const providerIds = current.filter((p) => getNetworkKey(p.network) === sectionKey).map((p) => p.id);
    const fromIndex = providerIds.indexOf(draggedId);
    const toIndex = providerIds.indexOf(targetId);
    if (fromIndex < 0 || toIndex < 0) return;

    const nextProviderIds = [...providerIds];
    const [moved] = nextProviderIds.splice(fromIndex, 1);
    nextProviderIds.splice(toIndex, 0, moved);

    const nextByNetwork: Record<string, any[]> = { MTN: [], Vodacom: [], Telkom: [], other: [] };
    for (const p of current) {
      nextByNetwork[getNetworkKey(p.network)].push(p);
    }

    const byId = new Map<string, any>();
    for (const p of nextByNetwork[sectionKey]) byId.set(p.id, p);
    nextByNetwork[sectionKey] = nextProviderIds.map((id) => byId.get(id)).filter(Boolean);

    const next = [...nextByNetwork.MTN, ...nextByNetwork.Vodacom, ...nextByNetwork.Telkom, ...nextByNetwork.other];
    setDraggingId(null);
    await reorder(next);
  };

  if (loading) return <div className="p-8">Loading packages...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-lg font-bold text-slate-800">LTE / 5G Packages</h2>
          <p className="text-sm text-slate-500 mt-1">Create, configure and reorder LTE / 5G packages available for purchase.</p>
        </div>
        <Button onClick={openCreateDialog} className="bg-indigo-600 hover:bg-indigo-700 font-bold rounded-lg">
          + Create Package
        </Button>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <Button variant={viewMode === "list" ? "default" : "outline"} size="sm" onClick={() => setViewMode("list")}>
              List View
            </Button>
            <Button variant={viewMode === "card" ? "default" : "outline"} size="sm" onClick={() => setViewMode("card")}>
              Card View
            </Button>
            {canReorder ? (
              <Badge variant="outline">Drag to reorder</Badge>
            ) : (
              <Badge variant="secondary">Reorder disabled while filtering</Badge>
            )}
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end md:gap-3">
            <Input
              placeholder="Search by name, description, or FUP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full md:w-[320px]"
            />
            <Select value={filterNetwork} onValueChange={(v) => setFilterNetwork(v as any)}>
              <SelectTrigger className="w-full md:w-[160px]">
                <SelectValue placeholder="Network" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Networks</SelectItem>
                <SelectItem value="MTN">MTN LTE / 5G Package</SelectItem>
                <SelectItem value="Telkom">Telkom LTE / 5G Package</SelectItem>
                <SelectItem value="Vodacom">Vodacom LTE / 5G Package</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
              <SelectTrigger className="w-full md:w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCapType} onValueChange={(v) => setFilterCapType(v as any)}>
              <SelectTrigger className="w-full md:w-[170px]">
                <SelectValue placeholder="Cap Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cap Types</SelectItem>
                <SelectItem value="capped">Capped</SelectItem>
                <SelectItem value="uncapped">Uncapped</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {sections.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-sm">No LTE / 5G packages match your search/filter.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sections.map((section) => (
              <div key={section.key} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-800">{section.title}</h3>
                    <Badge variant="outline">{section.items.length}</Badge>
                  </div>
                </div>

                {viewMode === "list" ? (
                  <div className="overflow-hidden rounded-lg border border-slate-100">
                    <Table>
                      <TableHeader className="bg-slate-50/50">
                        <TableRow>
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Cap</TableHead>
                          <TableHead>Speed</TableHead>
                          <TableHead>Price (R)</TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {section.items.map((pkg) => (
                          <TableRow
                            key={pkg.id}
                            draggable={canReorder}
                            onDragStart={(e) => {
                              if (!canReorder) return;
                              setDraggingId(pkg.id);
                              e.dataTransfer.setData("text/plain", pkg.id);
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => setDraggingId(null)}
                            onDragOver={(e) => {
                              if (!canReorder) return;
                              e.preventDefault();
                            }}
                            onDrop={(e) => {
                              if (!canReorder) return;
                              e.preventDefault();
                              const dragged = e.dataTransfer.getData("text/plain") || draggingId;
                              handleDropOnInSection(section.key, pkg.id, dragged);
                            }}
                            className={draggingId === pkg.id ? "opacity-60" : ""}
                          >
                            <TableCell className={canReorder ? "text-slate-400 select-none cursor-grab" : "text-slate-300 select-none"}>
                              ≡
                            </TableCell>
                            <TableCell className="font-medium">{pkg.name}</TableCell>
                            <TableCell className="text-xs text-slate-600 max-w-[340px] truncate">{pkg.description || "-"}</TableCell>
                            <TableCell>{pkg.dataCapGB === null ? "Uncapped" : `${pkg.dataCapGB} GB`}</TableCell>
                            <TableCell>{pkg.speedMbps === null ? "-" : `${pkg.speedMbps} Mbps`}</TableCell>
                            <TableCell>R{Number(pkg.price).toFixed(2)}</TableCell>
                            <TableCell>{Number(pkg.durationDays)} Days</TableCell>
                            <TableCell>
                              <Badge variant={pkg.isActive ? "default" : "secondary"}>{pkg.isActive ? "Active" : "Inactive"}</Badge>
                            </TableCell>
                            <TableCell className="text-right space-x-2">
                              <Button variant="outline" size="sm" onClick={() => openEditDialog(pkg)}>
                                Edit
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => toggleStatus(pkg.id, pkg.isActive)}>
                                Toggle Status
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => deletePackage(pkg)}
                              >
                                Delete
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {section.items.map((pkg) => (
                      <div key={pkg.id} className="rounded-xl border border-slate-100 bg-white p-4 flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate">{pkg.name}</div>
                            <div className="text-xs text-slate-500">
                              {pkg.dataCapGB === null ? "Uncapped" : `${pkg.dataCapGB} GB`} • {Number(pkg.durationDays)} Days
                            </div>
                          </div>
                          <Badge variant={pkg.isActive ? "default" : "secondary"}>{pkg.isActive ? "Active" : "Inactive"}</Badge>
                        </div>

                        {pkg.description ? <div className="text-xs text-slate-600 max-h-12 overflow-hidden">{pkg.description}</div> : null}

                        <div className="flex items-center justify-between pt-1">
                          <div className="text-sm font-black text-slate-900">R{Number(pkg.price).toFixed(2)}</div>
                          <div className="text-xs text-slate-500">{pkg.speedMbps === null ? "-" : `${pkg.speedMbps} Mbps`}</div>
                        </div>

                        <div className="flex items-center gap-2 pt-2">
                          <Button variant="outline" size="sm" onClick={() => openEditDialog(pkg)} className="flex-1">
                            Edit
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => toggleStatus(pkg.id, pkg.isActive)} className="flex-1">
                            Toggle
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => deletePackage(pkg)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {isDialogOpen && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Package" : "Add New Package"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-2">
                <Label>Package Name</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div className="grid gap-2">
                <Label>Description</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Cap Type</Label>
                  <Select
                    value={formData.capType}
                    onValueChange={(v) => {
                      const capType = v === "uncapped" ? "uncapped" : "capped";
                      setFormData((prev) =>
                        capType === "uncapped"
                          ? { ...prev, capType, dataCapGB: "", dayCapGB: "", nightCapGB: "" }
                          : { ...prev, capType }
                      );
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select cap type..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="capped">Capped</SelectItem>
                      <SelectItem value="uncapped">Uncapped</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Speed (Mbps)</Label>
                  <Input
                    type="number"
                    step="1"
                    value={formData.speedMbps}
                    onChange={(e) => setFormData({ ...formData, speedMbps: e.target.value })}
                    placeholder="Optional"
                  />
                </div>
              </div>
              {formData.capType === "capped" ? (
                <>
                  <div className="grid gap-2">
                    <Label>Total Cap (GB)</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={formData.dataCapGB}
                      onChange={(e) => setFormData({ ...formData, dataCapGB: normalizeDecimalInput(e.target.value) })}
                      placeholder="e.g. 12.5"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Day Cap (GB)</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={formData.dayCapGB}
                        onChange={(e) => setFormData({ ...formData, dayCapGB: normalizeDecimalInput(e.target.value) })}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Night Cap (GB)</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={formData.nightCapGB}
                        onChange={(e) => setFormData({ ...formData, nightCapGB: normalizeDecimalInput(e.target.value) })}
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                </>
              ) : null}
              <div className="grid gap-2">
                <Label>Fair Usage Policy (FUP)</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="xs" onClick={() => wrapSelection("**", "**")}>
                    Bold
                  </Button>
                  <Button type="button" variant="outline" size="xs" onClick={() => wrapSelection("*", "*")}>
                    Italic
                  </Button>
                  <Button type="button" variant="outline" size="xs" onClick={() => prefixLines("- ")}>
                    Bullet
                  </Button>
                  <Button type="button" variant="outline" size="xs" onClick={insertLink}>
                    Link
                  </Button>
                </div>
                <textarea
                  ref={fupRef}
                  value={formData.fup}
                  onChange={(e) => setFup(e.target.value)}
                  placeholder="Optional"
                  rows={4}
                  className="w-full min-w-0 resize-y rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80"
                />
              </div>
              <div className="grid gap-2">
                <Label>Price (ZAR)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label>Duration (Days)</Label>
                <Input
                  type="number"
                  value={formData.durationDays}
                  onChange={(e) => setFormData({ ...formData, durationDays: e.target.value })}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label>Network</Label>
                <Select value={formData.network} onValueChange={(v) => setFormData({ ...formData, network: v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select network..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MTN">MTN LTE / 5G Package</SelectItem>
                    <SelectItem value="Telkom">Telkom LTE / 5G Package</SelectItem>
                    <SelectItem value="Vodacom">Vodacom LTE / 5G Package</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter className="mt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">{editingId ? "Save Changes" : "Create Package"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
