/** The tone of an OSGi bundle state: an active bundle runs, an uninstalled one is gone, and every other state waits. */
export const stateTone = state => {
    if (state === 'ACTIVE') {
        return 'success';
    }

    return state === 'UNINSTALLED' ? 'danger' : 'warning';
};

/** The sentence-case label of a bundle state, such as "Active" for ACTIVE. */
export const stateLabel = (t, state) => (state ?
    t(`label.state.${state.toLowerCase()}`, {defaultValue: state}) :
    t('label.state.unknown'));
