import {useQuery} from '@apollo/client';
import gql from 'graphql-tag';

// The fields one table row shows. The details dialog loads the rest when it opens.
export const BUNDLE_ROW_QUERY = gql`query ModuleRow($module: String!, $version: String!) {
    admin {
        modulesManagement {
            bundle(name: $module, version: $version) {
                symbolicName bundleId state version type
                dependencies
                moduleDependencies
                clusterDeployment { nodeId bundles { key state } }
                clusterState
            }
        }
    }
}`;

/**
 * The bundle of one table row. Every cell of the row calls this hook with the same variables,
 * so Apollo sends one request per row and the cells read its result from the cache.
 */
export const useBundleRow = module => {
    const {data, error, loading, refetch} = useQuery(BUNDLE_ROW_QUERY, {
        variables: {module: module.name, version: module.version},
        fetchPolicy: 'cache-first'
    });

    return {bundle: data?.admin?.modulesManagement?.bundle, error, loading, refetch};
};

/** The names of the modules with an update that the bundle depends on. */
export const dependentUpdatesOf = (bundle, updates) => {
    const depList = bundle?.moduleDependencies?.length > 0 ? bundle.moduleDependencies : bundle?.dependencies;
    if (!depList) {
        return [];
    }

    return updates
        .filter(update => depList.some(dep => dep.split(' [')[0] === update.name))
        .map(update => update.name);
};
