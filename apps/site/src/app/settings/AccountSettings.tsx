"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Laptop, LoaderCircle, LogOut, ShieldCheck, Trash2, X } from "lucide-react";
import { SignOut } from "@/components/SignOut";
import { ResponsiveSections } from "@/components/profile/ResponsiveSections";
import { useT } from "@/components/T";
import { authClient } from "@/lib/auth-client";

type Props = { initial: { name: string; image: string; discordId: string } };

/**
 * Retour d'action. Le drapeau `erreur` sert à deux choses : annoncer l'échec en
 * `role="alert"` (un `role="status"` est poli et pouvait passer inaperçu) et le
 * peindre en rouge — jusqu'ici un échec s'affichait dans le même bandeau orange
 * qu'une réussite, donc indiscernable d'un « Profil enregistré ».
 */
type Avis = { texte: string; erreur: boolean };

/** Champ de saisie : 48 px de haut, filet 1 px, focus orange. */
const FIELD =
  "mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-black/30 px-4 text-base text-white outline-none focus:border-dbz-orange focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere";

type AccountSession = {
  id: string;
  token: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  expiresAt: Date | string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

const sessionDate = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function describeDevice(userAgent: string | null | undefined, inconnu: string) {
  if (!userAgent) return inconnu;
  const os = /Android/i.test(userAgent)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(userAgent)
      ? "iOS"
      : /Windows/i.test(userAgent)
        ? "Windows"
        : /Mac OS X|Macintosh/i.test(userAgent)
          ? "macOS"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : inconnu;
  const browser = /Edg\//i.test(userAgent)
    ? "Edge"
    : /Firefox\//i.test(userAgent)
      ? "Firefox"
      : /Chrome\//i.test(userAgent)
        ? "Chrome"
        : /Safari\//i.test(userAgent)
          ? "Safari"
          : null;
  return browser ? `${browser} · ${os}` : os;
}

export default function AccountSettings({ initial }: Props) {
  const router = useRouter();
  const deletionDialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(initial.name);
  const [image, setImage] = useState(initial.image);
  const t = useT();
  const appareil = (ua: string | null | undefined) =>
    describeDevice(ua, t("settings.unknownDevice"));
  const [avis, setAvis] = useState<Avis | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmer = (texte: string) => setAvis({ texte, erreur: false });
  const avertir = (texte: string) => setAvis({ texte, erreur: true });
  const [sessions, setSessions] = useState<AccountSession[] | null>(null);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [sessionsError, setSessionsError] = useState(false);
  const [revokingToken, setRevokingToken] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setSessionsError(false);
    const [sessionsResult, currentResult] = await Promise.all([
      authClient.listSessions(),
      authClient.getSession(),
    ]);
    if (sessionsResult.error) {
      setSessionsError(true);
      setSessions([]);
      return;
    }
    setSessions(sessionsResult.data ?? []);
    setCurrentToken(currentResult.data?.session.token ?? null);
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const avatar = image.trim();
    if (avatar) {
      try {
        if (new URL(avatar).protocol !== "https:") throw new Error("not https");
      } catch {
        avertir(t("settings.noticeAvatarUrl"));
        return;
      }
    }
    setBusy(true);
    setAvis(null);
    const result = await authClient.updateUser({
      name: name.trim(),
      // `undefined` signifiait « ne touche pas au champ » : vider la case
      // n'effaçait donc jamais l'avatar, alors que le message annonçait
      // « Profil enregistré ». `null` est la valeur d'effacement admise par
      // Better Auth (`image` y est déclaré nullable).
      image: avatar || null,
    });
    setBusy(false);
    if (result.error) avertir(t("settings.noticeSaveFailed"));
    else {
      confirmer(t("settings.noticeSaved"));
      router.refresh();
    }
  }

  async function revokeOthers() {
    setBusy(true);
    setAvis(null);
    const result = await authClient.revokeOtherSessions();
    setBusy(false);
    if (result.error) {
      avertir(t("settings.noticeCloseOthersFailed"));
      return;
    }
    confirmer(t("settings.noticeClosedOthers"));
    await loadSessions();
  }

  async function revokeOne(token: string) {
    setRevokingToken(token);
    setAvis(null);
    const result = await authClient.revokeSession({ token });
    setRevokingToken(null);
    if (result.error) {
      avertir(t("settings.noticeCloseFailed"));
      return;
    }
    setSessions((current) => current?.filter((session) => session.token !== token) ?? []);
    confirmer(t("settings.noticeClosed"));
  }

  async function deleteAccount() {
    setBusy(true);
    setAvis(null);
    const result = await authClient.deleteUser({ callbackURL: "/" });
    setBusy(false);
    if (result.error) {
      deletionDialog.current?.close();
      avertir(t("settings.noticeDeleteFailed"));
      return;
    }
    router.replace("/");
    router.refresh();
  }

  const identity = (
    <>
      <p className="text-sm text-white/55">{t("settings.identityLead")}</p>
      <form onSubmit={save} className="mt-5 space-y-5">
        <label className="block text-sm font-medium text-white/75">
          {t("settings.nickname")}
          <input
            autoComplete="nickname"
            required
            minLength={2}
            maxLength={48}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={FIELD}
          />
        </label>
        <label className="block text-sm font-medium text-white/75">
          {t("settings.avatarUrl")}
          <input
            type="url"
            inputMode="url"
            autoComplete="url"
            maxLength={500}
            value={image}
            onChange={(event) => setImage(event.target.value)}
            placeholder="https://…"
            className={FIELD}
          />
        </label>
        <p className="text-xs text-white/45">
          {t("settings.discordId", { id: initial.discordId })}
        </p>
        <button
          disabled={busy || name.trim().length < 2}
          className="min-h-11 w-full rounded-full bg-dbz-orange px-5 text-sm font-bold text-black hover:bg-dbz-orange-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere disabled:opacity-50 sm:w-auto"
        >
          {busy ? t("settings.saving") : t("settings.save")}
        </button>
      </form>
    </>
  );

  const sessionsPanel = (
    <>
      <p className="text-sm text-white/55">{t("settings.sessionsLead")}</p>
      {sessions === null ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-white/55" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
          {t("settings.sessionsLoading")}
        </div>
      ) : sessionsError ? (
        <div className="mt-5 rounded-lg border border-dbz-red/40 p-3">
          <p className="text-sm text-white/80">{t("settings.sessionsError")}</p>
          <button
            type="button"
            onClick={() => void loadSessions()}
            className="mt-2 min-h-11 text-sm font-semibold text-dbz-orange hover:text-white focus-visible:outline-2 focus-visible:outline-kinto-lumiere"
          >
            {t("settings.retry")}
          </button>
        </div>
      ) : (
        <>
          {sessions.length === 0 && (
            <p className="mt-5 text-sm text-white/55">{t("settings.sessionsEmpty")}</p>
          )}
          <ul className="mt-5 space-y-2">
            {sessions.map((session) => {
              const isCurrent = session.token === currentToken;
              return (
                <li
                  key={session.id}
                  className="flex items-center gap-3 rounded-lg border border-white/12 p-3"
                >
                  <Laptop className="h-4 w-4 shrink-0 text-white/45" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-white/85">
                        {appareil(session.userAgent)}
                      </p>
                      {isCurrent && (
                        <span className="rounded-full border border-dbz-green px-2 py-0.5 text-xs font-semibold text-white">
                          {t("settings.currentSession")}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-white/45">
                      {session.ipAddress || t("settings.unknownIp")}{" "}
                      {t("settings.lastActivity", {
                        date: sessionDate.format(new Date(session.updatedAt)),
                      })}
                    </p>
                  </div>
                  {!isCurrent && (
                    <button
                      type="button"
                      onClick={() => void revokeOne(session.token)}
                      disabled={revokingToken !== null || busy}
                      aria-label={t("settings.closeSession", {
                        device: appareil(session.userAgent),
                      })}
                      className="grid size-11 shrink-0 place-items-center rounded-full text-white/60 hover:bg-dbz-red/15 hover:text-white focus-visible:outline-2 focus-visible:outline-kinto-lumiere disabled:opacity-40"
                    >
                      {revokingToken === session.token ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <X className="h-4 w-4" aria-hidden />
                      )}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <button
        type="button"
        onClick={revokeOthers}
        disabled={busy || revokingToken !== null || (sessions?.length ?? 0) < 2}
        className="mt-5 min-h-11 w-full rounded-full border border-dbz-red/60 px-4 text-sm font-semibold text-white/85 hover:bg-dbz-red/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere disabled:opacity-50"
      >
        {t("settings.closeOthers")}
      </button>
    </>
  );

  const dataPanel = (
    <>
      <p className="text-sm text-white/55">{t("settings.dataLead")}</p>
      <a
        href="/api/account/export"
        download
        className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-white/12 px-4 text-sm font-semibold text-white/85 hover:border-white/40 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere"
      >
        <Download className="h-4 w-4" aria-hidden />
        {t("settings.download")}
      </a>
    </>
  );

  const deletePanel = (
    <>
      <p className="max-w-2xl text-sm text-white/55">{t("settings.deleteLead")}</p>
      <button
        type="button"
        onClick={() => deletionDialog.current?.showModal()}
        disabled={busy}
        className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-dbz-red px-5 text-sm font-semibold text-white hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        {t("settings.deleteCta")}
      </button>
    </>
  );

  return (
    <div>
      {avis && (
        <p
          role={avis.erreur ? "alert" : "status"}
          className={`mb-5 rounded-lg border p-4 text-sm text-white ${
            avis.erreur ? "border-dbz-red/60 bg-dbz-red/10" : "border-dbz-green/60 bg-dbz-green/10"
          }`}
        >
          {avis.texte}
        </p>
      )}
      <h2 className="sr-only">{t("settings.sections")}</h2>
      <ResponsiveSections
        sections={[
          { id: "identite", title: t("settings.identityTitle"), content: identity },
          {
            id: "sessions",
            title: (
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-dbz-orange" aria-hidden />
                {t("settings.sessionsTitle")}
              </span>
            ),
            meta: sessions && sessions.length > 0 ? sessions.length : undefined,
            content: sessionsPanel,
          },
          { id: "donnees", title: t("settings.dataTitle"), content: dataPanel },
          {
            id: "suppression",
            title: t("settings.deleteTitle"),
            tone: "danger",
            content: deletePanel,
          },
        ]}
      />
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <SignOut className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/12 px-5 text-sm text-white/80 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere">
          <LogOut className="h-4 w-4" aria-hidden />
          {t("settings.signOut")}
        </SignOut>
        <Link
          href="/profile/me"
          className="inline-flex min-h-11 items-center text-sm text-white/80 underline underline-offset-4 hover:text-white focus-visible:outline-2 focus-visible:outline-kinto-lumiere"
        >
          {t("settings.publicProfile")}
        </Link>
      </div>
      {/* `<dialog>` natif ouvert par `showModal()` : piège du focus, Échap et
          arrière-plan inerte fournis par le navigateur. Le premier élément
          focalisable est « Annuler » : la sortie sûre a le focus par défaut. */}
      <dialog
        ref={deletionDialog}
        aria-labelledby="delete-title"
        aria-describedby="delete-lead"
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-dbz-red/50 bg-dbz-card p-0 text-white backdrop:bg-black/75"
      >
        <div className="p-6">
          <Trash2 className="h-6 w-6 text-dbz-red" aria-hidden />
          <h2 id="delete-title" className="mt-4 text-xl font-semibold">
            {t("settings.deleteConfirmTitle")}
          </h2>
          <p id="delete-lead" className="mt-2 text-sm leading-relaxed text-white/65">
            {t("settings.deleteConfirmLead")}
          </p>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => deletionDialog.current?.close()}
              className="min-h-11 rounded-full border border-white/12 px-4 text-sm text-white/85 hover:border-white/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={deleteAccount}
              disabled={busy}
              className="min-h-11 rounded-full bg-dbz-red px-5 text-sm font-bold text-white hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kinto-lumiere disabled:opacity-50"
            >
              {busy ? t("settings.deleting") : t("settings.deleteButton")}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
