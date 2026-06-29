import React, {useEffect, useRef, useState} from 'react';
import {useMutation} from '@apollo/client';
import gql from 'graphql-tag';
import {useTranslation} from 'react-i18next';
import {Badge, Button, Chip, Close, CloudUpload, Reload, Replay, Rocket, Separator, Switch, Typography, Warning} from '@jahia/moonstone';
import {Dialog, DialogActions, DialogContent, DialogTitle} from '@material-ui/core';
import * as PropTypes from 'prop-types';
import styles from './BundleDetails.scss';
import Mermaid from './Mermaid';
import BundleInfo from './BundleInfo';
import UnresolvedRequirementsTab from './UnresolvedRequirementsTab';

const BUNDLE_TYPE_COLOR = {
    module: 'success',
    templatesSet: 'success',
    system: 'accent',
    bundle: 'accent'
};

const TABS = [
    {id: 'details', labelKey: 'label.bundle.tab.details'},
    {id: 'sites', labelKey: 'label.bundle.tab.sites', condition: b => b.type === 'module' && b.sitesDeployment?.length > 0},
    {id: 'versions', labelKey: 'label.bundle.tab.versions', condition: b => b.storeVersions?.length > 0 || b.previousVersions?.length > 0},
    // Only show graph tabs when the mermaid output contains actual edges ('-->')
    // An INSTALLED (unresolved) bundle always produces the mermaid header but no edges
    {id: 'bundleDeps', labelKey: 'label.bundle.tab.bundleDeps', condition: b => b.dependenciesGraph?.includes('-->')},
    {id: 'moduleDeps', labelKey: 'label.bundle.tab.moduleDeps', condition: b => b.moduleDependenciesGraph?.includes('-->')},
    {
        id: 'unresolvedReqs',
        labelKey: 'label.bundle.tab.unresolvedReqs',
        condition: b => b.unresolvedRequirements?.some(r => !r.optional),
        // Danger when any mandatory requirement is completely missing; warning when providers exist but won't wire
        getColor: (b, isActive) => {
            if (isActive) {
                return 'accent';
            }

            return b.unresolvedRequirements?.some(r => !r.optional && !r.hasProviders) ? 'danger' : 'warning';
        }
    }
];

/**
 * Compare two OSGi-style version strings (major.minor.patch[.qualifier]).
 * Returns > 0 if a > b, < 0 if a < b, 0 if equal (qualifier is ignored).
 */
const compareOsgiVersions = (a, b) => {
    const parts = v => (v || '0').split('.').slice(0, 3).map(n => parseInt(n, 10) || 0);
    const [aMaj, aMin, aPat] = parts(a);
    const [bMaj, bMin, bPat] = parts(b);
    if (aMaj !== bMaj) {
        return aMaj - bMaj;
    }

    if (aMin !== bMin) {
        return aMin - bMin;
    }

    return aPat - bPat;
};

const BundleDetails = ({bundle: initialBundle, close, refetch}) => {
    const {t} = useTranslation('module-management-community');
    const [bundle, setBundle] = useState(initialBundle);
    const [activeTab, setActiveTab] = useState('details');
    const [importResult, setImportResult] = useState(null);
    const [installVersionResult, setInstallVersionResult] = useState(null);
    // Tracks pending install for the downgrade confirmation dialog.
    // Shape: null | { source: 'store', version } | { source: 'jcr', version, jcrPath }
    const [confirmInstall, setConfirmInstall] = useState(null);
    // A11y HIGH-6: refs to each tab button so keyboard nav can move DOM focus
    const tabRefs = useRef({});

    useEffect(() => {
        setBundle(initialBundle);
    }, [initialBundle]);

    const [enableOnSite] = useMutation(gql`mutation ($bundleId: Long!, $siteKeys: [String]!) {
        admin { modulesManagement { bundle(bundleId: $bundleId) { enableOnSites(siteKeys: $siteKeys) } } }
    }`, {variables: {bundleId: bundle.bundleId, siteKeys: []}});

    const [disableOnSite] = useMutation(gql`mutation ($bundleId: Long!, $siteKeys: [String]!) {
        admin { modulesManagement { bundle(bundleId: $bundleId) { disableOnSites(siteKeys: $siteKeys) } } }
    }`, {variables: {bundleId: bundle.bundleId, siteKeys: []}});

    const [importModuleMutation] = useMutation(gql`mutation ($bundleId: Long!) {
        admin { modulesManagement { importModule(bundleId: $bundleId, force: true) } }
    }`);

    const [installBundleFromJcrMutation] = useMutation(gql`mutation ($jcrPath: String!) {
        admin { modulesManagement { installBundleFromJcr(jcrPath: $jcrPath) } }
    }`);

    const [installBundleFromStoreMutation] = useMutation(gql`mutation ($symbolicName: String!, $version: String!) {
        admin { modulesManagement { installBundleFromStore(symbolicName: $symbolicName, version: $version) } }
    }`);

    const handleSiteDeployment = async (event, value, checked) => {
        try {
            if (checked) {
                await enableOnSite({variables: {bundleId: bundle.bundleId, siteKeys: [value]}});
            } else {
                await disableOnSite({variables: {bundleId: bundle.bundleId, siteKeys: [value]}});
            }

            await refetch();
        } catch (error) {
            console.error('Error updating site deployment:', error);
        }
    };

    const handleForceImport = async () => {
        try {
            const result = await importModuleMutation({variables: {bundleId: bundle.bundleId}});
            const msg = result?.data?.admin?.modulesManagement?.importModule;
            setImportResult({success: true, message: msg || t('label.importModule.success')});
        } catch (error) {
            setImportResult({success: false, message: t('label.importModule.error')});
            console.error('Error force-importing module:', error);
        }

        setTimeout(() => setImportResult(null), 5000);
    };

    /**
     * Execute the install — dispatches to the correct mutation by source:
     *   source='store'  → provisioning YAML (upgrade-safe, no JAR download)
     *   source='jcr'    → JCR binary install (supports downgrade, version already in JCR)
     */
    const executeInstall = async target => {
        setInstallVersionResult(null);
        try {
            let msg;
            if (target.source === 'store') {
                const result = await installBundleFromStoreMutation({
                    variables: {symbolicName: bundle.symbolicName, version: target.version}
                });
                msg = result?.data?.admin?.modulesManagement?.installBundleFromStore;
            } else {
                const result = await installBundleFromJcrMutation({variables: {jcrPath: target.jcrPath}});
                msg = result?.data?.admin?.modulesManagement?.installBundleFromJcr;
            }

            setInstallVersionResult({success: true, message: msg || t('label.bundle.versions.installSuccess')});
            await refetch();
        } catch (error) {
            setInstallVersionResult({success: false, message: t('label.bundle.versions.installError')});
            console.error('Error installing bundle version:', error);
        }

        setTimeout(() => setInstallVersionResult(null), 6000);
    };

    /**
     * Initiate an install:
     *  - Store upgrades: execute immediately (provisioning YAML is upgrade-only, safe)
     *  - JCR downgrades: show confirmation dialog first
     *  - Everything else: execute immediately
     */
    const handleInstallClick = target => {
        const isDowngrade = compareOsgiVersions(target.version, bundle.version) < 0;
        const isJcr = target.source !== 'store';
        if (isDowngrade && isJcr) {
            setConfirmInstall(target); // Downgrade via JCR requires explicit confirmation
        } else {
            executeInstall(target);
        }
    };

    const handleBulkSites = async (enable, excludeSystem) => {
        try {
            const siteKeys = bundle.sitesDeployment
                .filter(site => !excludeSystem || site.siteKey !== 'systemsite')
                .map(site => site.siteKey);
            if (enable) {
                await enableOnSite({variables: {bundleId: bundle.bundleId, siteKeys}});
            } else {
                await disableOnSite({variables: {bundleId: bundle.bundleId, siteKeys}});
            }

            await refetch();
        } catch (error) {
            console.error('Error bulk updating sites:', error);
        }
    };

    const visibleTabs = TABS.filter(tab => !tab.condition || tab.condition(bundle));

    // Prefer the human-readable Bundle-Name from the manifest; fall back to symbolic name
    const bundleDisplayName = bundle.manifest?.find(e => e.key === 'Bundle-Name')?.value || bundle.symbolicName;

    return (
        <DialogContent className={styles.bundleDetailsContainer}>
            <div className={styles.bundleDetailsHeader}>
                <div className={styles.bundleDetailsTitle}>
                    <Typography id="bundle-details-title" variant="title" component="h2">{bundleDisplayName}</Typography>
                    <Badge label={'v' + bundle.version} color="accent"/>
                    <Badge label={bundle.type || 'bundle'}
                           color={BUNDLE_TYPE_COLOR[bundle.type] || 'default'}/>
                    <Chip variant="bright"
                          label={bundle.state}
                          color={bundle.state === 'ACTIVE' ? 'success' : 'danger'}
                          icon={<Rocket/>}/>
                    <Typography variant="caption" className={styles.bundleId}>[{bundle.bundleId}]</Typography>
                </div>
                <div className={styles.bundleDetailsHeaderActions}>
                    {(bundle.type === 'module' || bundle.type === 'templatesSet') && (
                        <Button variant="ghost"
                                size="default"
                                color="default"
                                icon={<CloudUpload/>}
                                label={t('label.importModule.button')}
                                title={t('label.importModule.tooltip')}
                                onClick={handleForceImport}/>
                    )}
                    <Button variant="ghost"
                            size="default"
                            color="default"
                            icon={<Reload/>}
                            label={t('label.refresh')}
                            onClick={() => refetch()}/>
                    <Button variant="ghost"
                            size="default"
                            color="default"
                            icon={<Close/>}
                            label={t('label.close')}
                            onClick={() => close(false)}/>
                </div>
            </div>

            {/* A11y A-009: import result as live alert region */}
            {importResult && (
                <div
                    role={importResult.success ? 'status' : 'alert'}
                    aria-live={importResult.success ? 'polite' : 'assertive'}
                    aria-atomic="true"
                    style={{
                        padding: '8px 16px',
                        margin: '4px 0',
                        borderRadius: '4px',
                        backgroundColor: importResult.success ? 'var(--color-success_light)' : 'var(--color-danger_light)',
                        color: importResult.success ? 'var(--color-success_dark)' : 'var(--color-danger_dark)',
                        fontSize: '13px'
                    }}
                >
                    {importResult.message}
                </div>
            )}

            <Separator variant="horizontal" spacing="none"/>

            {/* A11y A-007 / C-007 / C-012: ARIA tablist with native <button> (guaranteed attr forwarding)
                 and Arrow-key / Home / End keyboard navigation (roving tabindex) */}
            <div role="tablist"
                 aria-label={t('label.bundle.tabs.label', 'Bundle detail sections')}
                 className={styles.bundleDetailsTabs}
                 onKeyDown={e => {
                     const idx = visibleTabs.findIndex(tab => tab.id === activeTab);
                     let nextId = null;
                     if (e.key === 'ArrowRight') {
                         nextId = visibleTabs[(idx + 1) % visibleTabs.length].id;
                     } else if (e.key === 'ArrowLeft') {
                         nextId = visibleTabs[(idx - 1 + visibleTabs.length) % visibleTabs.length].id;
                     } else if (e.key === 'Home') {
                         nextId = visibleTabs[0].id;
                     } else if (e.key === 'End') {
                         nextId = visibleTabs[visibleTabs.length - 1].id;
                     }

                     if (nextId) {
                         e.preventDefault();
                         setActiveTab(nextId);
                         // A11y HIGH-6: move DOM focus to the newly-activated tab button
                         tabRefs.current[nextId]?.focus();
                     }
                 }}
            >
                {visibleTabs.map(tab => {
                    const isActive = activeTab === tab.id;
                    const color = tab.getColor ?
                        tab.getColor(bundle, isActive) :
                        (isActive ? 'accent' : 'default');
                    const colorClass = color === 'accent' ? styles.tabBtnAccent :
                        color === 'danger' ? styles.tabBtnDanger :
                        color === 'warning' ? styles.tabBtnWarning : '';
                    return (
                        <button
                            key={tab.id}
                            ref={el => {
                                tabRefs.current[tab.id] = el;
                            }}
                            type="button"
                            role="tab"
                            tabIndex={isActive ? 0 : -1}
                            aria-selected={isActive}
                            aria-controls={`tabpanel-${tab.id}`}
                            id={`tab-${tab.id}`}
                            className={`${styles.tabBtn} ${colorClass} ${isActive ? styles.tabBtnActive : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {t(tab.labelKey)}
                        </button>
                    );
                })}
            </div>

            <Separator variant="horizontal" spacing="none"/>

            {/* A11y A-007: tabpanel role with labelledby */}
            <div id={`tabpanel-${activeTab}`}
                 role="tabpanel"
                 aria-labelledby={`tab-${activeTab}`}
                 className={styles.bundleDetailsContent}
            >
                {activeTab === 'details' && (
                    <BundleInfo bundle={bundle}/>
                )}

                {activeTab === 'sites' && (
                    <div>
                        <div className={styles.siteActionButtons}>
                            <Button variant="outlined"
                                    size="normal"
                                    color="accent"
                                    label={t('label.bundle.sites.actions.enableAllSites')}
                                    className={styles.siteActionButton}
                                    onClick={() => handleBulkSites(true, false)}/>
                            <Button variant="outlined"
                                    size="normal"
                                    color="accent"
                                    label={t('label.bundle.sites.actions.enableAllSitesExceptSystem')}
                                    className={styles.siteActionButton}
                                    onClick={() => handleBulkSites(true, true)}/>
                            <Button variant="outlined"
                                    size="normal"
                                    color="accent"
                                    label={t('label.bundle.sites.actions.disableAllSites')}
                                    className={styles.siteActionButton}
                                    onClick={() => handleBulkSites(false, false)}/>
                            <Button variant="outlined"
                                    size="normal"
                                    color="accent"
                                    label={t('label.bundle.sites.actions.disableAllSitesExceptSystem')}
                                    className={styles.siteActionButton}
                                    onClick={() => handleBulkSites(false, true)}/>
                        </div>
                        <ul className={styles.siteList}>
                            {bundle.sitesDeployment.map(site => (
                                <li key={site.siteKey} className={styles.siteItem}>
                                    <Typography variant="subheading" weight="semiBold" className={styles.siteName}>
                                        {site.siteKey}
                                    </Typography>
                                    <div className={styles.siteControl}>
                                        <Badge label={site.deployed ? t('label.bundle.sites.enabled') : t('label.bundle.sites.disabled')}
                                               color={site.deployed ? 'success' : 'danger'}/>
                                        <Switch checked={site.deployed}
                                                value={site.siteKey}
                                                aria-label={t('label.bundle.sites.toggleAriaLabel', {
                                                    site: site.siteKey,
                                                    defaultValue: `Toggle deployment on site ${site.siteKey}`
                                                })}
                                                onChange={handleSiteDeployment}/>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {activeTab === 'versions' && (() => {
                    // Build a fast lookup: version string → JCR entry (path + metadata)
                    const jcrByVersion = {};
                    (bundle.previousVersions || []).forEach(v => {
                        jcrByVersion[v.version] = v;
                    });
                    // JCR versions NOT in the store catalogue (legacy / non-store sources)
                    const storeVersionStrings = new Set((bundle.storeVersions || []).map(v => v.version));
                    const jcrOnlyVersions = (bundle.previousVersions || [])
                        .filter(v => !storeVersionStrings.has(v.version));

                    return (
                        <div className={styles.versionsTab}>
                            {/* A11y A-009: install result as live alert region */}
                            {installVersionResult && (
                                <div
                                    role={installVersionResult.success ? 'status' : 'alert'}
                                    aria-live={installVersionResult.success ? 'polite' : 'assertive'}
                                    aria-atomic="true"
                                    style={{
                                        padding: '8px 16px',
                                        marginBottom: '12px',
                                        borderRadius: '4px',
                                        backgroundColor: installVersionResult.success ? 'var(--color-success_light)' : 'var(--color-danger_light)',
                                        color: installVersionResult.success ? 'var(--color-success_dark)' : 'var(--color-danger_dark)',
                                        fontSize: '13px'
                                    }}
                                >
                                    {installVersionResult.message}
                                </div>
                            )}

                            {/* ── Store catalogue versions ── */}
                            {bundle.storeVersions?.length > 0 && (
                                <>
                                    <Typography variant="subheading" weight="semiBold" className={styles.versionSectionTitle}>
                                        {t('label.bundle.versions.storeSection')}
                                    </Typography>
                                    <Typography variant="caption" className={styles.versionHistoryHint}>
                                        {t('label.bundle.versions.storeHint')}
                                    </Typography>
                                    <ul className={styles.versionList}>
                                        {bundle.storeVersions.map(v => {
                                            const isCurrent = v.version === bundle.version;
                                            const isUpgrade = compareOsgiVersions(v.version, bundle.version) > 0;
                                            const jcrEntry = jcrByVersion[v.version];
                                            return (
                                                <li key={v.version} className={styles.versionItem}>
                                                    <div className={styles.versionItemInfo}>
                                                        <div className={styles.versionItemHeader}>
                                                            <Badge label={v.version} color={isCurrent ? 'default' : 'accent'}/>
                                                            {isCurrent ? (
                                                                <Badge label={t('label.bundle.versions.current')} color="success"/>
                                                            ) : (
                                                                <Badge
                                                                    label={isUpgrade ? t('label.bundle.versions.upgrade') : t('label.bundle.versions.downgrade')}
                                                                    color={isUpgrade ? 'success' : 'danger'}
                                                                />
                                                            )}
                                                            {jcrEntry && (
                                                                <Badge label={t('label.bundle.versions.inJcr')} color="default"/>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {!isCurrent && isUpgrade && (
                                                        // Upgrade: provisioning YAML via store (safe, no downgrade risk)
                                                        <Button
                                                            variant="outlined"
                                                            size="small"
                                                            color="accent"
                                                            icon={<Replay/>}
                                                            label={t('label.bundle.versions.install')}
                                                            onClick={() => handleInstallClick({source: 'store', version: v.version})}
                                                        />
                                                    )}
                                                    {!isCurrent && !isUpgrade && jcrEntry && (
                                                        // Downgrade in JCR: use JCR binary (only path that supports downgrade)
                                                        <Button
                                                            variant="outlined"
                                                            size="small"
                                                            color="danger"
                                                            icon={<Replay/>}
                                                            label={t('label.bundle.versions.install')}
                                                            onClick={() => handleInstallClick({source: 'jcr', version: v.version, jcrPath: jcrEntry.jcrPath})}
                                                        />
                                                    )}
                                                    {!isCurrent && !isUpgrade && !jcrEntry && v.storeUrl && (
                                                        // Downgrade not in JCR: link to store page (cannot install without JCR binary)
                                                        <Button
                                                            variant="ghost"
                                                            size="small"
                                                            color="default"
                                                            label={t('label.bundle.versions.viewOnStore')}
                                                            onClick={() => window.open(v.storeUrl, '_blank', 'noopener,noreferrer')}
                                                        />
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </>
                            )}

                            {/* ── JCR-only versions (not in store catalogue) ── */}
                            {jcrOnlyVersions.length > 0 && (
                                <>
                                    <Typography
                                        variant="subheading"
                                        weight="semiBold"
                                        className={styles.versionSectionTitle}
                                        style={{marginTop: bundle.storeVersions?.length > 0 ? '16px' : 0}}
                                    >
                                        {t('label.bundle.versions.jcrSection')}
                                    </Typography>
                                    <Typography variant="caption" className={styles.versionHistoryHint}>
                                        {t('label.bundle.versions.jcrHint')}
                                    </Typography>
                                    <ul className={styles.versionList}>
                                        {jcrOnlyVersions.map(v => {
                                            const sizeKb = v.size ? (v.size / (1024 * 1024)).toFixed(2) + ' MB' : '—';
                                            const date = v.lastModified ? new Date(v.lastModified).toLocaleString() : '—';
                                            const isUpgrade = compareOsgiVersions(v.version, bundle.version) > 0;
                                            return (
                                                <li key={v.jcrPath} className={styles.versionItem}>
                                                    <div className={styles.versionItemInfo}>
                                                        <div className={styles.versionItemHeader}>
                                                            <Badge label={v.version} color="accent"/>
                                                            <Badge
                                                                label={isUpgrade ? t('label.bundle.versions.upgrade') : t('label.bundle.versions.downgrade')}
                                                                color={isUpgrade ? 'success' : 'danger'}
                                                            />
                                                            <Badge label={t('label.bundle.versions.inJcr')} color="default"/>
                                                        </div>
                                                        <Typography variant="caption" className={styles.versionMeta}>
                                                            {v.fileName} &nbsp;·&nbsp; {sizeKb} &nbsp;·&nbsp; {date}
                                                        </Typography>
                                                    </div>
                                                    <Button
                                                        variant="outlined"
                                                        size="small"
                                                        color="accent"
                                                        icon={<Replay/>}
                                                        label={t('label.bundle.versions.install')}
                                                        onClick={() => handleInstallClick({source: 'jcr', version: v.version, jcrPath: v.jcrPath})}
                                                    />
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </>
                            )}
                        </div>
                    );
                })()}

                {activeTab === 'bundleDeps' && (
                    <Mermaid ariaLabel={t('label.bundle.tab.bundleDeps.ariaLabel', 'Bundle dependency graph')}>{bundle.dependenciesGraph}</Mermaid>
                )}

                {activeTab === 'moduleDeps' && (
                    <Mermaid ariaLabel={t('label.bundle.tab.moduleDeps.ariaLabel', 'Module dependency graph')}>{bundle.moduleDependenciesGraph}</Mermaid>
                )}

                {activeTab === 'unresolvedReqs' && (
                    <UnresolvedRequirementsTab bundle={bundle}/>
                )}
            </div>

            {/* A11y A-023: aria-labelledby/describedby on downgrade confirm dialog */}
            <Dialog open={Boolean(confirmInstall)}
                    aria-labelledby="confirm-install-title"
                    aria-describedby="confirm-install-desc"
                    onClose={() => setConfirmInstall(null)}
            >
                <DialogTitle id="confirm-install-title">
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <Warning color="var(--color-warning)" aria-hidden="true"/>
                        {t('label.bundle.versions.confirm.title')}
                    </div>
                </DialogTitle>
                <DialogContent id="confirm-install-desc">
                    <Typography variant="body">
                        {t('label.bundle.versions.confirm.message')}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button variant="ghost"
                            size="big"
                            label={t('label.cancel')}
                            onClick={() => setConfirmInstall(null)}/>
                    <Button variant="default"
                            size="big"
                            color="danger"
                            icon={<Replay/>}
                            label={t('label.bundle.versions.confirm.proceed')}
                            onClick={() => {
                                const target = confirmInstall;
                                setConfirmInstall(null);
                                executeInstall(target);
                            }}/>
                </DialogActions>
            </Dialog>
        </DialogContent>
    );
};

BundleDetails.propTypes = {
    bundle: PropTypes.object.isRequired,
    close: PropTypes.func.isRequired,
    refetch: PropTypes.func.isRequired
};

export default BundleDetails;
