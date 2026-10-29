import React, {Suspense} from 'react';
import ModuleManagementCommunityApp from './ModuleManagementCommunityApp';
import styles from './ModuleManagementCommunityEntry.scss';

export const ModuleManagementCommunityEntry = () => (
    /* A11y B-013: Suspense fallback as accessible live region */
    <Suspense fallback={
        <div role="status" aria-live="polite" aria-label="Loading">
            <span className={styles.srOnly}>Loading…</span>
        </div>
    }
    >
        <div className={styles.root} id="module-management-community-root">
            <ModuleManagementCommunityApp/>
        </div>
    </Suspense>
);

export default ModuleManagementCommunityEntry;
