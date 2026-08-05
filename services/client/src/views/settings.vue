<template>
  <div>
    <PageHeader
      title="Settings"
      subtitle="Inspect and generate the configuration from your current setup"
      icon="settings"
    />

    <div v-if="settingsStore.isLoading" class="loading-state" role="status" aria-live="polite">
      <div class="spinner"></div>
      <span>Loading settings…</span>
    </div>

    <template v-else>
      <section class="settings-card" aria-labelledby="tools-title">
        <div class="settings-card-head">
          <span class="material-icons settings-card-icon" aria-hidden="true">fact_check</span>
          <h2 id="tools-title" class="settings-card-title">Configuration</h2>
        </div>

        <div class="setting-row">
          <div class="setting-text">
            <div class="setting-name">Preview config files</div>
            <div class="setting-sub">
              Builds <code>pssid_config.json</code> and <code>hosts.ini</code> from the
              current database state and checks them against the same rules the daemon
              enforces, without writing anything to disk.
            </div>
          </div>
          <!-- One control for both jobs. Before a panel exists the action is
               Preview; once one is on screen the same click rebuilds it, so
               the button says Refresh. Two buttons doing the identical thing
               was the alternative, and the second one only ever appeared after
               the first had already been used. -->
          <button
            type="button"
            class="btn btn-secondary"
            :disabled="settingsStore.previewLoading"
            :aria-busy="settingsStore.previewLoading"
            @click="previewConfig"
          >
            <Transition name="icon-fade" mode="out-in">
              <span v-if="settingsStore.previewLoading" key="spin" class="inline-spinner" aria-hidden="true"></span>
              <span v-else :key="previewAction.icon" class="material-icons btn-icon" aria-hidden="true">{{ previewAction.icon }}</span>
            </Transition>
            {{ settingsStore.previewLoading ? previewAction.busyLabel : previewAction.label }}
          </button>
        </div>

        <!-- Only for the FIRST preview, when there is no panel yet: a rebuild
             keeps the panel below on screen and shows its busy state there.
             Every appear/disappear block on this page shares the one "fade"
             transition (defined once, below .settings-card) rather than each
             getting its own bespoke animation -- the consistency is what
             reads as a single polished system instead of a pile of one-off
             effects. -->
        <Transition name="fade">
          <div
            v-if="settingsStore.previewLoading && !settingsStore.preview"
            class="loading-state"
            role="status"
            aria-live="polite"
          >
            <div class="spinner"></div>
            <span>Building preview…</span>
          </div>
        </Transition>

        <Transition name="fade">
          <p v-if="settingsStore.previewError" ref="previewErrorEl" class="preview-error" role="alert">
            <span class="material-icons" aria-hidden="true">error</span>
            {{ settingsStore.previewError }}
          </p>
        </Transition>

        <Transition name="fade">
          <div v-if="settingsStore.preview" ref="previewResultEl" class="preview-result" aria-live="polite">
            <div class="preview-status valid">
              <span class="preview-status-msg">
                <span class="material-icons" aria-hidden="true">check_circle</span>
                <span>No validation problems found</span>
              </span>
              <!-- The guided next step: validation already happened server-side
                   to produce this preview, so there is nothing more to check --
                   only Generate's own write-access gate stands between here and
                   the controller, same as the standalone button below. Hidden
                   for read-only accounts rather than shown disabled, since a
                   nudge toward an action they cannot take is not guidance. -->
              <button
                v-if="!isReadOnly"
                type="button"
                class="cta-generate"
                :disabled="settingsStore.generateLoading"
                @click="generateConfig"
              >
                Generate these files
                <span class="material-icons" aria-hidden="true">arrow_forward</span>
              </button>
            </div>

            <div class="preview-tabs" role="tablist" aria-label="Preview file">
              <button
                type="button"
                role="tab"
                :aria-selected="previewTab === 'config'"
                :class="{ active: previewTab === 'config' }"
                @click="previewTab = 'config'"
              >
                pssid_config.json
              </button>
              <button
                type="button"
                role="tab"
                :aria-selected="previewTab === 'inventory'"
                :class="{ active: previewTab === 'inventory' }"
                @click="previewTab = 'inventory'"
              >
                hosts.ini
              </button>
            </div>
            <div class="preview-pane">
              <pre class="preview-pre">{{ previewText }}</pre>
              <!-- The outgoing file stays visible under the scrim rather than
                   being replaced by a blank box, so the panel keeps its height
                   and the page does not jump while the rebuild is in flight.
                   Faded rather than popped in/out: MIN_BUSY_MS (settings.store)
                   already keeps this on screen a minimum of 400ms so a fast
                   rebuild doesn't skip past unnoticed, but a hard-cut v-if still
                   read as a flicker at that duration. A soft crossfade on both
                   edges is what makes a deliberately-brief state look intentional
                   instead of broken. -->
              <!-- No role="status": .preview-result already carries aria-live,
                   and a nested live region announces this twice. -->
              <Transition name="scrim-fade">
                <div v-if="settingsStore.previewLoading" class="preview-busy">
                  <span class="inline-spinner" aria-hidden="true"></span>
                  <span>Rebuilding…</span>
                </div>
              </Transition>
            </div>
          </div>
        </Transition>

        <div class="setting-divider" role="separator"></div>

        <div class="setting-row">
          <div class="setting-text">
            <div class="setting-name">Generate config files</div>
            <div class="setting-sub">
              Validates the configuration, then writes <code>pssid_config.json</code>
              and <code>hosts.ini</code> to the controller (the server's output
              directory, <code>/var/lib/pssid/output</code> on a standard deploy).
              This generates the files only; delivering them to the probes is a
              separate step.
            </div>
          </div>
          <!-- Generate WRITES files on the controller, so it is gated on write
               access like every form on every other page. Preview above is a
               read, and stays available: inspecting the configuration is
               exactly what a read-only account is for. -->
          <button
            type="button"
            class="btn btn-primary"
            :disabled="settingsStore.generateLoading || isReadOnly"
            :aria-busy="settingsStore.generateLoading"
            :title="isReadOnly ? 'Generating writes files on the controller, which needs write access.' : ''"
            @click="generateConfig"
          >
            <Transition name="icon-fade" mode="out-in">
              <span v-if="settingsStore.generateLoading" key="spin" class="inline-spinner" aria-hidden="true"></span>
              <span v-else key="icon" class="material-icons btn-icon" aria-hidden="true">description</span>
            </Transition>
            {{ settingsStore.generateLoading ? 'Generating...' : 'Generate' }}
          </button>
        </div>

        <!-- Generate runs the provision script on the controller, which is the
             slowest thing this page does and produces nothing until it is over.
             The button's own spinner is easy to miss once it has been clicked
             and the pointer has moved away. -->
        <Transition name="fade">
          <div
            v-if="settingsStore.generateLoading"
            class="loading-state"
            role="status"
            aria-live="polite"
          >
            <div class="spinner"></div>
            <span>Writing files to the controller…</span>
          </div>
        </Transition>

        <Transition name="fade">
          <p v-if="settingsStore.generateError" ref="generateErrorEl" class="preview-error" role="alert">
            <span class="material-icons" aria-hidden="true">error</span>
            {{ settingsStore.generateError }}
          </p>
        </Transition>

        <!-- Auto-dismissed ~5s after landing (see generateConfig() below) --
             a confirmation that has to be manually cleared before the next
             action reads as a leftover, not a result. Still a real aria-live
             announcement while it's up, so screen readers get it once either
             way. -->
        <Transition name="fade">
          <div v-if="settingsStore.generated" ref="generatedEl" class="preview-status valid" role="status" aria-live="polite">
            <span class="material-icons" aria-hidden="true">check_circle</span>
            <span>Files written to the controller</span>
          </div>
        </Transition>
      </section>
    </template>

  </div>
</template>

<script>
import PageHeader from '../components/PageHeader.vue'
import { useSettingsStore } from '../stores/settings.store'
import { useUserStore } from '../stores/user.store'
import { isFormDisabled } from '../utils/formControl.ts'

// How long "Files written to the controller" stays up before it fades itself
// out. Long enough to read at a glance without racing the eye, short enough
// that it is gone well before it could be mistaken for the outcome of a
// later click. Not tied to MIN_BUSY_MS (settings.store): that constant times
// a busy state that's over the instant the request resolves, while this
// times how long a message parked at rest stays worth looking at.
const GENERATED_DISMISS_MS = 5000;

export default {
  name: 'Settings',
  components: { PageHeader },
  data() {
    return {
      settingsStore: useSettingsStore(),
      userStore: useUserStore(),
      previewTab: 'config',
      generatedDismissTimer: null,
    }
  },
  computed: {
    // The same verdict every other page's forms use, so this button and they
    // are never in disagreement about what the server would accept.
    isReadOnly() {
      return isFormDisabled();
    },
    // What the preview button is offering right now. Keyed on the panel being
    // on screen, not on "has been clicked": if a preview fails or is cleared,
    // the button goes back to offering Preview, which is what the click will
    // actually do.
    previewAction() {
      return this.settingsStore.preview
        ? { label: 'Refresh', busyLabel: 'Refreshing...', icon: 'refresh' }
        : { label: 'Preview', busyLabel: 'Previewing...', icon: 'visibility' };
    },
    previewText() {
      if (!this.settingsStore.preview) return '';
      return this.previewTab === 'config'
        ? this.settingsStore.preview.proposed.config
        : this.settingsStore.preview.proposed.inventory;
    },
  },
  async mounted() {
    // Always fetched: carries the server's effective auth posture as well as
    // the identity. See the note in schedules.vue.
    await this.userStore.fetchUser();
    await this.settingsStore.getSettings();
  },
  beforeUnmount() {
    clearTimeout(this.generatedDismissTimer);
  },
  methods: {
    // Brings whichever outcome just landed (result panel or inline error)
    // on screen. block: 'nearest' is what makes this safe to call after
    // every Preview/Refresh alike -- an element that's already fully
    // visible (the common Refresh case) does not move at all, only a
    // panel that grew past the viewport does.
    scrollToOutcome(el) {
      if (!el) return;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
    },
    async previewConfig() {
      await this.settingsStore.previewConfig();
      await this.$nextTick();
      this.scrollToOutcome(this.$refs.previewErrorEl || this.$refs.previewResultEl);
    },
    async generateConfig() {
      // Cancels a dismiss timer left over from a previous success so it
      // can't fire mid-way through this run and hide a result that just
      // landed.
      clearTimeout(this.generatedDismissTimer);
      await this.settingsStore.generateConfig();
      await this.$nextTick();
      this.scrollToOutcome(this.$refs.generateErrorEl || this.$refs.generatedEl);
      if (this.settingsStore.generated) {
        this.generatedDismissTimer = setTimeout(() => {
          this.settingsStore.dismissGenerated();
        }, GENERATED_DISMISS_MS);
      }
    },
  },
}
</script>

<style scoped>
.settings-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  padding: 1.25rem 1.35rem;
  margin-bottom: 1.25rem;
}
.settings-card-head {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
  padding-bottom: 1rem;
  margin-bottom: 0.5rem;
  border-bottom: 1px solid var(--border);
}
.settings-card-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: rgba(var(--primary-rgb), .07);
  color: var(--primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.settings-card-title {
  font-size: 1rem !important;
  font-weight: 700 !important;
  color: var(--text) !important;
  margin: 0 0 0.15rem !important;
  text-transform: none !important;
  letter-spacing: 0 !important;
  border: none !important;
  padding: 0 !important;
}
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 0.85rem 0 0.35rem;
}
.setting-divider {
  height: 1px;
  background: var(--border);
  margin: 1rem 0 0.25rem;
}
.setting-text {
  flex: 1;
  min-width: 0;
}
.setting-name {
  font-weight: 600;
  font-size: 0.92rem;
  color: var(--text);
  margin-bottom: 0.2rem;
}
.setting-sub {
  font-size: 0.8rem;
  color: var(--muted);
  line-height: 1.5;
  max-width: 68ch;
}
.setting-sub code {
  background: rgba(var(--primary-rgb), .08);
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
  font-size: 0.78rem;
  color: var(--text);
}
.btn-icon {
  font-size: 1rem;
  vertical-align: -3px;
  margin-right: 0.35rem;
}
/* These buttons swap labels: Preview/Refresh on click, and both take a longer
   form while busy ("Previewing...", "Refreshing...", "Generating..."). Bootstrap's
   .btn already centers its label, so fixing a min-width sized to the longest
   state is enough to stop the button -- and the icon beside it users are about
   to click again -- from shifting under the pointer. */
.setting-row .btn {
  min-width: 10rem;
  white-space: nowrap;
}
.preview-result {
  margin-top: 1rem;
}
.preview-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.65rem 0.9rem;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  margin-bottom: 0.75rem;
}
.preview-status-msg {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.preview-status .material-icons {
  font-size: 1.15rem;
  flex-shrink: 0;
}
.preview-status.valid {
  background: var(--ok-soft-bg);
  color: var(--ok-soft-fg);
  border: 1px solid var(--ok-soft-bd);
}
/* The preview panel's guided next step: same "done, now do the real thing"
   role as a "Learn more ->" link, so it borrows that vocabulary -- text-only,
   no button chrome, the arrow the only thing that moves. Inherits the status
   bar's ok-soft-fg so it reads as part of the same success message rather
   than a competing control. */
.cta-generate {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 0;
  background: transparent;
  border: none;
  padding: 0;
  font: inherit;
  font-weight: 700;
  color: var(--ok-soft-fg);
  cursor: pointer;
  white-space: nowrap;
}
.cta-generate:hover:not(:disabled) {
  text-decoration: underline;
}
.cta-generate:disabled {
  opacity: 0.5;
  cursor: default;
}
.cta-generate .material-icons {
  font-size: 1rem;
  transition: transform 0.15s ease;
}
.cta-generate:hover:not(:disabled) .material-icons {
  transform: translateX(2px);
}
.preview-error {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.82rem;
  color: var(--warn-soft-fg);
  background: var(--warn-soft-bg);
  border: 1px solid var(--warn-soft-bd);
  border-radius: var(--radius-sm);
  padding: 0.65rem 0.9rem;
  margin: 0.75rem 0 0;
  white-space: pre-line;
}
.preview-error .material-icons {
  font-size: 1.1rem;
  flex-shrink: 0;
}
/* Tabs and Refresh share a row, with the -1px that pulls the tab strip flush
   against the panel moved up here so it applies to the whole row. align-items:
   flex-end keeps Refresh sitting on the tabs' baseline rather than stretching. */
.preview-tabs {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
/* Detached pills rather than tabs docked to the panel below. Both files are
   offered as a pair of equals here, and a free-standing pill can carry the
   selected marker on all four sides instead of only the edge facing away from
   the panel. Sized by an even border box (see .active) so selecting one does
   not shift the other. */
.preview-tabs button {
  background: transparent;
  /* --field-border, not --border: these are interactive controls whose own
     outline is the affordance, and only --field-border is guaranteed >= 3:1
     against the surface in every theme (WCAG 1.4.11). */
  border: 2px solid var(--field-border);
  border-radius: 10px;
  padding: 0.4rem 0.95rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease;
}
.preview-tabs button:hover:not(.active) {
  border-color: var(--text);
  color: var(--text);
}
/* Selected: a full accent outline, plus a faint accent wash and brighter text.
   Three cues rather than one because the edition accent is an inline style the
   themes cannot override (see main.css) and its luminance is the edition's
   choice: cyan or maize on a white surface is well under 3:1, so on the light
   themes the stroke is recognizable but is not carrying the state on its own.
   The high-contrast paths below drop the accent entirely for that reason. */
.preview-tabs button.active {
  border-color: var(--accent);
  background: rgba(var(--accent-rgb), 0.12);
  color: var(--text);
}
/* High contrast, by either route -- the "High contrast" theme in the menu or
   an OS-level contrast preference. Both mean the same thing here: an accent
   the app does not control cannot be trusted to mark the selected pill, so
   invert it instead. A filled pill against an outlined one is a difference in
   form as well as color, at the maximum contrast the theme has to offer. */
/* No :global() around the ancestor: scoped styles attach the component's
   data attribute to the last element of the selector only, so a plain
   ancestor works -- and :global(X) Y compiles to a bare X here, dropping the
   descendant and restyling the document root. */
:root[data-theme='accessible'] .preview-tabs button.active {
  background: var(--text);
  border-color: var(--text);
  color: var(--surface);
}
@media (prefers-contrast: more) {
  .preview-tabs button.active {
    background: var(--text);
    border-color: var(--text);
    color: var(--surface);
  }
}
/* Windows High Contrast: the OS palette replaces every color above, including
   the accent stroke and the wash, which would leave the two pills identical.
   System color keywords are honored, so the selected pill is painted in the
   user's own selection colors. */
@media (forced-colors: active) {
  .preview-tabs button.active {
    background: Highlight;
    border-color: Highlight;
    color: HighlightText;
  }
}
.preview-pane {
  position: relative;
}
/* Scrim over the outgoing file while a refresh is in flight. The panel is
   deliberately dark in every theme (see .preview-pre), so these are fixed
   light-on-dark values rather than theme tokens, matching the panel they
   cover. */
.preview-busy {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  background: rgba(15, 23, 42, 0.72);
  color: #e2e8f0;
  font-size: 0.85rem;
  border-radius: 6px;
}
/* Crossfade for the scrim above, in and out alike, rather than the hard
   v-if cut. Opacity only, no rise: it sits on top of text that isn't moving,
   so a translate would read as the scrim sliding rather than the code
   settling. prefers-reduced-motion collapses this to a single frame via the
   global transition-duration override in assets/main.css. */
.scrim-fade-enter-active,
.scrim-fade-leave-active {
  transition: opacity 0.18s ease;
}
.scrim-fade-enter-from,
.scrim-fade-leave-to {
  opacity: 0;
}
/* The one entrance/exit used by every loading, error and success block on
   this page (see the template) -- a single shared transition rather than a
   bespoke one per element is what makes them read as one system instead of
   a pile of unrelated effects. The slight rise is what separates this from
   the scrim fade above: these blocks change the page's height as they
   arrive, and a few px of upward motion sells "settling into place" instead
   of just appearing over whatever reflowed under it. */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
/* The glyph inside Preview/Generate/Refresh: icon and spinner trade places
   with a fast crossfade instead of an instant swap. mode="out-in" in the
   template keeps only one of the two in the DOM at a time, so this never
   needs the scrim's absolute-position trick. Quick on purpose -- this fires
   on every click, and anything slower than the click itself would read as
   lag rather than polish. */
.icon-fade-enter-active,
.icon-fade-leave-active {
  transition: opacity 0.12s ease;
}
.icon-fade-enter-from,
.icon-fade-leave-to {
  opacity: 0;
}
/* One spinner for the buttons and the scrim both. It takes its color from the
   text beside it, so it stays visible on a filled primary button, a ghost
   button and the dark panel without a per-context override, and is sized in em
   so it tracks whatever label it sits next to. pssid-spin is the global
   keyframe from main.css, where the reduced-motion rule also applies. */
.inline-spinner {
  display: inline-block;
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  opacity: 0.9;
  animation: pssid-spin 0.7s linear infinite;
  flex-shrink: 0;
}
/* .btn is inline-block, not flex, so the spinner needs the same nudge and gap
   .btn-icon uses to sit on the label's line. */
.btn .inline-spinner {
  vertical-align: -0.12em;
  margin-right: 0.35rem;
}
.preview-pre {
  margin: 0;
  max-height: 360px;
  overflow: auto;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 6px;
  padding: 0.85rem 1rem;
  font-size: 0.78rem;
  line-height: 1.5;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  white-space: pre;
}

:root[data-theme="dark"] .setting-sub code {
  background: #0e1626;
}

@media (max-width: 700px) {
  .setting-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }
  .preview-status.valid {
    flex-wrap: wrap;
    row-gap: 0.5rem;
  }
}
</style>
