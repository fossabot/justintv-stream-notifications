import React from 'react';
import PropTypes from 'prop-types';
import NavigateableList from '../navigateable-list.jsx';
import Channel from './channel.jsx';
import LiveState from '../../../live-state.json';
import Extras from './extras.jsx';
import { redirectorsShape } from './redirecting.jsx';

const channelsShape = PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.oneOfType([
            PropTypes.number,
            PropTypes.string
        ]).isRequired,
        image: PropTypes.objectOf(PropTypes.string).isRequired,
        liveState: PropTypes.oneOf(Object.values(LiveState)).isRequired,
        uname: PropTypes.string.isRequired,
        title: PropTypes.string,
        type: PropTypes.string.isRequired,
        thumbnail: PropTypes.string,
        extras: PropTypes.shape(Extras.propTypes),
        redirectors: redirectorsShape,
        imageSize: PropTypes.number,
        external: PropTypes.bool,
        url: PropTypes.string.isRequired,
        tooltip: PropTypes.string.isRequired
    })),
    ChannelList = (props) => {
        const channels = props.channels.map((ch) => {
            const onClick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    props.onChannel(ch);
                },
                onContextMenu = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    props.onContext(ch);
                };
            return ( <Channel { ...ch } onClick={ onClick } onRedirectorClick={ props.onChannel } onContextMenu={ onContextMenu } onCopy={ props.onCopy } key={ ch.id }/> );
        });
        return ( <NavigateableList role="tabpanel" className="scrollable">
            { channels }
        </NavigateableList> );
    };
ChannelList.propTypes = {
    channels: channelsShape.isRequired,
    onChannel: PropTypes.func.isRequired,
    onContext: PropTypes.func.isRequired,
    onCopy: PropTypes.func.isRequired
};

export default ChannelList;
export { channelsShape };