import React, {useEffect, useState} from 'react';
import {useMutation} from '@apollo/client';
import gql from 'graphql-tag';
import {useTranslation} from 'react-i18next';
import {Badge, Button, Chip, Close, Reload, Rocket, Separator, Switch, Typography} from '@jahia/moonstone';
import {DialogContent} from '@material-ui/core';
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
    {id: 'bundleDeps', labelKey: 'label.bundle.tab.bundleDeps', condition: b => b.dependenciesGraph?.length > 0},
    {id: 'moduleDeps', labelKey: 'label.bundle.tab.moduleDeps', condition: b => b.moduleDependencies?.length > 0}
];

const BundleDetails = ({bundle: initialBundle, close, refetch}) => {
    const {t} = useTranslation('module-management-community');
    const [bundle, setBundle] = useState(initialBundle);
    const [activeTab, setActiveTab] = useState('details');

    useEffect(() => {
        setBundle(initialBundle);
    }, [initialBundle]);

    const [enableOnSite] = useMutation(gql`mutation ($bundleId: Long!, $siteKeys: [String]!) {
        admin { modulesManagement { bundle(bundleId: $bundleId) { enableOnSites(siteKeys: $siteKeys) } } }
    }`, {variables: {bundleId: bundle.bundleId, siteKeys: []}});

    const [disableOnSite] = useMutation(gql`mutation ($bundleId: Long!, $siteKeys: [String]!) {
        admin { modulesManagement { bundle(bundleId: $bundleId) { disableOnSites(siteKeys: $siteKeys) } } }
    }`, {variables: {bundleId: bundle.bundleId, siteKeys: []}});

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

                {activeTab === 'bundleDeps' && (
                    <Mermaid>{bundle.dependenciesGraph}</Mermaid>
                )}

                {activeTab === 'moduleDeps' && (
                    <Mermaid>{bundle.moduleDependenciesGraph}</Mermaid>
                )}
            </div>
        </DialogContent>
    );
};

BundleDetails.propTypes = {
    bundle: PropTypes.object.isRequired,
    close: PropTypes.func.isRequired,
    refetch: PropTypes.func.isRequired
};

export default BundleDetails;

