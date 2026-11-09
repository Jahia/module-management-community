import React from 'react';
import {useQuery} from '@apollo/client';
import gql from 'graphql-tag';
import {useTranslation} from 'react-i18next';
import {Loader, Modal, ModalBody, Typography} from '@jahia/moonstone';
import * as PropTypes from 'prop-types';
import BundleDetails from './BundleDetails';
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

/** The details of one bundle, loaded when the dialog opens. */
const BundleDetailsDialog = ({name, version, isOpen, onClose, onChange}) => {
    const {t} = useTranslation('module-management-community');
    const {data, error, refetch} = useQuery(BUNDLE_DETAILS_QUERY, {
        variables: {module: name, version},
        fetchPolicy: 'network-only',
        skip: !isOpen
    });
    const bundle = data?.admin?.modulesManagement?.bundle;

    const refresh = async () => {
        await refetch();
        await onChange();
    };

    let content;
    if (error) {
        content = (
            <ModalBody>
                <Typography variant="body" className={styles.dialogMessage}>{t('label.errors.loadingModuleData')}</Typography>
            </ModalBody>
        );
    } else if (bundle) {
        // BundleDetails renders the header, the tabs and the body of the modal
        content = <BundleDetails bundle={bundle} close={onClose} refetch={refresh}/>;
    } else {
        content = (
            <ModalBody>
                <div className={styles.dialogMessage} role="status" aria-label={t('label.loading')}>
                    <Loader size="big"/>
                </div>
            </ModalBody>
        );
    }

    // A11y A-011: Modal with aria-labelledby pointing to bundle title
    return (
        <Modal isOpen={isOpen}
               size="full"
               className={detailsStyles.bundleDetailsModal}
               aria-labelledby="bundle-details-title"
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
