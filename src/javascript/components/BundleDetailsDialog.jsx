import React, {useEffect} from 'react';
import {useQuery} from '@apollo/client';
import gql from 'graphql-tag';
import {useTranslation} from 'react-i18next';
import {Button, Close, Loader, Modal, ModalBody, Typography} from '@jahia/moonstone';
import * as PropTypes from 'prop-types';
import BundleDetails, {BUNDLE_DETAILS_CLOSE_ID, BUNDLE_DETAILS_TITLE_ID} from './BundleDetails';
import detailsStyles from './BundleDetails.scss';
import styles from './ModuleManagementCommunityApp.scss';

const BUNDLE_DETAILS_QUERY = gql`query BundleDetails($module: String!, $version: String!) {
    admin {
        modulesManagement {
            bundle(name: $module, version: $version) {
                symbolicName bundleId state version type
                manifest { key value }
                dependencies
                dependenciesGraph(depth: 2)
                moduleDependencies
                moduleDependenciesGraph
                nodeTypesDependencies
                license services servicesInUse
                unresolvedRequirements { namespace filter optional hasProviders }
                sitesDeployment { siteKey deployed }
                clusterDeployment { nodeId bundles { key state } }
                clusterState
                previousVersions { version jcrPath fileName size lastModified }
                storeVersions { version storeUrl }
            }
        }
    }
}`;

/** The header of the dialog while the bundle loads or fails to load: the same title and Close button as BundleDetails. */
const PendingHeader = ({title, onClose}) => {
    const {t} = useTranslation('module-management-community');
    return (
        <header className={detailsStyles.bundleDetailsHeader}>
            <div className={detailsStyles.bundleDetailsTitleRow}>
                <div className={detailsStyles.bundleDetailsTitle}>
                    <Typography id={BUNDLE_DETAILS_TITLE_ID} variant="heading" component="h2" className={detailsStyles.bundleDetailsName}>
                        {title}
                    </Typography>
                </div>
                <Button id={BUNDLE_DETAILS_CLOSE_ID}
                        variant="ghost"
                        size="default"
                        color="default"
                        icon={<Close/>}
                        label={t('label.close')}
                        onClick={() => onClose(false)}/>
            </div>
        </header>
    );
};

PendingHeader.propTypes = {
    title: PropTypes.string.isRequired,
    onClose: PropTypes.func.isRequired
};

/** The details of one bundle, loaded when the dialog opens. */
const BundleDetailsDialog = ({name, version, isOpen, onClose, onChange}) => {
    const {t} = useTranslation('module-management-community');
    const {data, error, refetch} = useQuery(BUNDLE_DETAILS_QUERY, {
        variables: {module: name, version},
        fetchPolicy: 'network-only',
        skip: !isOpen
    });
    const bundle = data?.admin?.modulesManagement?.bundle;
    const hasBundle = Boolean(bundle);
    const hasError = Boolean(error);

    // The header is rendered again when the bundle loads or fails, which removes the focused Close button:
    // focus then falls to the body, so it moves to the Close button of the new header.
    useEffect(() => {
        if (isOpen && (!document.activeElement || document.activeElement === document.body)) {
            document.getElementById(BUNDLE_DETAILS_CLOSE_ID)?.focus();
        }
    }, [isOpen, hasBundle, hasError]);

    const refresh = async () => {
        await refetch();
        await onChange();
    };

    let content;
    if (error) {
        content = (
            <>
                <PendingHeader title={name} onClose={onClose}/>
                <ModalBody>
                    <Typography variant="body" component="div" role="alert" className={styles.dialogMessage}>
                        {t('label.errors.loadingModuleData')}
                    </Typography>
                </ModalBody>
            </>
        );
    } else if (bundle) {
        // BundleDetails renders the header, the tabs and the body of the modal
        content = <BundleDetails bundle={bundle} close={onClose} refetch={refresh}/>;
    } else {
        content = (
            <>
                <PendingHeader title={name} onClose={onClose}/>
                <ModalBody>
                    <div className={styles.dialogMessage} role="status">
                        <Loader size="big"/>
                        <span className={detailsStyles.srOnly}>{t('label.loading')}</span>
                    </div>
                </ModalBody>
            </>
        );
    }

    return (
        <Modal isOpen={isOpen}
               size="full"
               className={detailsStyles.bundleDetailsModal}
               aria-labelledby={BUNDLE_DETAILS_TITLE_ID}
               data-testid="bundle-details-dialog"
               onOpenChange={open => !open && onClose()}
        >
            {content}
        </Modal>
    );
};

BundleDetailsDialog.propTypes = {
    name: PropTypes.string.isRequired,
    version: PropTypes.string.isRequired,
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onChange: PropTypes.func.isRequired
};

export default BundleDetailsDialog;
