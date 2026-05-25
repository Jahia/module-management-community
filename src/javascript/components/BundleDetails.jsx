import React, {useEffect, useState} from 'react';
import {useMutation} from '@apollo/client';
import gql from 'graphql-tag';
import {useTranslation} from 'react-i18next';
import {Badge, Button, Chip, Close, CloudUpload, Reload, Replay, Rocket, Separator, Switch, Typography, Warning} from '@jahia/moonstone';
import {Dialog, DialogActions, DialogContent, DialogTitle} from '@material-ui/core';
import * as PropTypes from 'prop-types';
import styles from './ModuleManagementCommunityApp.scss';
import Mermaid from './Mermaid';
import BundleInfo from './BundleInfo';

const BUNDLE_TYPE_COLOR = {
    module: 'success',
    templatesSet: 'success',
    system: 'accent',
    bundle: 'accent'
};

const TABS = [
    {id: 'details', labelKey: 'label.bundle.tab.details'},
    {id: 'sites', labelKey: 'label.bundle.tab.sites', condition: b => b.type === 'module' && b.sitesDeployment?.length > 0},
    {id: 'versions', labelKey: 'label.bundle.tab.versions', condition: b => b.previousVersions?.length > 0},
    {id: 'bundleDeps', labelKey: 'label.bundle.tab.bundleDeps', condition: b => b.dependenciesGraph?.length > 0},
    {id: 'moduleDeps', labelKey: 'label.bundle.tab.moduleDeps', condition: b => b.moduleDependencies?.length > 0}
];

/**
 * Compare two OSGi-style version strings (major.minor.patch[.qualifier]).
 * Returns > 0 if a > b, < 0 if a < b, 0 if equal (qualifier is ignored).
 */
const compareOsgiVersions = (a, b) => {
    const parts = v => (v || '0').split('.').slice(0, 3).map(n => parseInt(n, 10) || 0);
    const [aMaj, aMin, aPat] = parts(a);
    const [bMaj, bMin, bPat] = parts(b);
    return aMaj !== bMaj ? aMaj - bMaj :
        aMin !== bMin ? aMin - bMin :
            aPat - bPat;
};

const BundleDetails = ({bundle: initialBundle, close, refetch}) => {
    const {t} = useTranslation('module-management-community');
    const [bundle, setBundle] = useState(initialBundle);
    const [activeTab, setActiveTab] = useState('details');
    const [importResult, setImportResult] = useState(null);
    const [installVersionResult, setInstallVersionResult] = useState(null);
    const [confirmJcrPath, setConfirmJcrPath] = useState(null);

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

    const handleInstallVersion = async jcrPath => {
        setInstallVersionResult(null);
        try {
            const result = await installBundleFromJcrMutation({variables: {jcrPath}});
            const msg = result?.data?.admin?.modulesManagement?.installBundleFromJcr;
            setInstallVersionResult({success: true, message: msg || t('label.bundle.versions.installSuccess')});
            await refetch();
        } catch (error) {
            setInstallVersionResult({success: false, message: t('label.bundle.versions.installError')});
            console.error('Error installing bundle version:', error);
        }

        setTimeout(() => setInstallVersionResult(null), 6000);
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

    return (
        <DialogContent className={styles.bundleDetailsContainer}>
            <div className={styles.bundleDetailsHeader}>
                <div className={styles.bundleDetailsTitle}>
                    <Typography variant="title">{bundle.symbolicName}</Typography>
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
                                size="small"
                                color="default"
                                icon={<CloudUpload/>}
                                label={t('label.importModule.button')}
                                title={t('label.importModule.tooltip')}
                                onClick={handleForceImport}/>
                    )}
                    <Button variant="ghost"
                            size="small"
                            color="default"
                            icon={<Reload/>}
                            label={t('label.refresh')}
                            onClick={() => refetch()}/>
                    <Button variant="ghost"
                            size="small"
                            color="default"
                            icon={<Close/>}
                            label={t('label.close')}
                            onClick={() => close(false)}/>
                </div>
            </div>

            {importResult && (
                <div
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

            <div className={styles.bundleDetailsTabs}>
                {visibleTabs.map(tab => (
                    <Button key={tab.id}
                            variant={activeTab === tab.id ? 'outlined' : 'ghost'}
                            size="small"
                            color={activeTab === tab.id ? 'accent' : 'default'}
                            label={t(tab.labelKey)}
                            onClick={() => setActiveTab(tab.id)}/>
                ))}
            </div>

            <Separator variant="horizontal" spacing="none"/>

            <div className={styles.bundleDetailsContent}>
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
                                                onChange={handleSiteDeployment}/>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {activeTab === 'versions' && (
                    <div className={styles.versionsTab}>
                        {installVersionResult && (
                            <div
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
                        <Typography variant="body" className={styles.versionHistoryHint}>
                            {t('label.bundle.versions.hint')}
                        </Typography>
                        <ul className={styles.versionList}>
                            {bundle.previousVersions.map(v => {
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
                                            onClick={() => {
                                                if (compareOsgiVersions(v.version, bundle.version) > 0) {
                                                    // Installing a newer version — no warning needed
                                                    handleInstallVersion(v.jcrPath);
                                                } else {
                                                    // Installing an older version — show downgrade dialog
                                                    setConfirmJcrPath(v.jcrPath);
                                                }
                                            }}
                                        />
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}

                {activeTab === 'bundleDeps' && (
                    <Mermaid>{bundle.dependenciesGraph}</Mermaid>
                )}

                {activeTab === 'moduleDeps' && (
                    <Mermaid>{bundle.moduleDependenciesGraph}</Mermaid>
                )}
            </div>

            <Dialog open={Boolean(confirmJcrPath)} onClose={() => setConfirmJcrPath(null)}>
                <DialogTitle>
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                        <Warning color="var(--color-warning)"/>
                        {t('label.bundle.versions.confirm.title')}
                    </div>
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body">
                        {t('label.bundle.versions.confirm.message')}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button variant="ghost"
                            size="big"
                            label={t('label.cancel')}
                            onClick={() => setConfirmJcrPath(null)}/>
                    <Button variant="default"
                            size="big"
                            color="danger"
                            icon={<Replay/>}
                            label={t('label.bundle.versions.confirm.proceed')}
                            onClick={() => {
                                const path = confirmJcrPath;
                                setConfirmJcrPath(null);
                                handleInstallVersion(path);
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

